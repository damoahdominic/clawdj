#!/usr/bin/env python3
"""ClawDJ CLI — AI-powered DJ mashup tool."""
import os
import sys
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.panel import Panel
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from services.separator import separate_stems
from services.analyzer import analyze_track, are_compatible
from services.mixer import create_mashup
from services.discovery import search_and_download, search_tracks

app = typer.Typer(
    name="clawdj",
    help="🦞 ClawDJ — AI-powered DJ mashup tool",
    add_completion=False,
)
console = Console()

STEMS_DIR = Path("stems")
OUTPUT_DIR = Path("outputs")
DOWNLOAD_DIR = Path("downloads")
for d in [STEMS_DIR, OUTPUT_DIR, DOWNLOAD_DIR]:
    d.mkdir(exist_ok=True)


@app.command()
def analyze(song: str = typer.Argument(..., help="Path to audio file or search query")):
    """Analyze a track — show BPM, key, duration, energy."""
    # If not a file, try to find/download it
    if not os.path.isfile(song):
        console.print(f"[yellow]'{song}' is not a file, searching...[/yellow]")
        song = search_and_download(song, str(DOWNLOAD_DIR))
        console.print(f"[green]Downloaded:[/green] {song}")

    with console.status("[bold blue]Analyzing track..."):
        info = analyze_track(song)

    table = Table(title=f"🎵 {Path(song).stem}")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")
    table.add_row("BPM", str(info["bpm"]))
    table.add_row("Key", f"{info['key']} ({info['camelot']})")
    table.add_row("Duration", f"{info['duration_sec']:.1f}s ({info['duration_sec']/60:.1f}m)")
    table.add_row("Energy", str(info["energy"]))
    table.add_row("Beats", str(info["beat_count"]))
    console.print(table)


@app.command()
def mix(
    song_a: str = typer.Argument(..., help="First track (file path or search query)"),
    song_b: str = typer.Argument(..., help="Second track (file path or search query)"),
    vocals_from: str = typer.Option("a", "--vocals", "-v", help="Which track to take vocals from (a or b)"),
    output: str = typer.Option(None, "--output", "-o", help="Output file path"),
):
    """Mix two songs into a mashup — vocals from one, beat from the other."""
    # Resolve tracks
    for label, song_ref in [("A", song_a), ("B", song_b)]:
        if not os.path.isfile(song_ref):
            console.print(f"[yellow]Track {label}: '{song_ref}' not found, searching...[/yellow]")
            path = search_and_download(song_ref, str(DOWNLOAD_DIR))
            console.print(f"[green]Downloaded {label}:[/green] {path}")
            if label == "A":
                song_a = path
            else:
                song_b = path

    console.print(Panel("🦞 [bold]ClawDJ Mashup Engine[/bold]", subtitle="Let's cook"))

    # Analyze
    with console.status("[bold blue]Analyzing Track A..."):
        analysis_a = analyze_track(song_a)
    console.print(f"  Track A: {analysis_a['bpm']} BPM, key {analysis_a['key']}")

    with console.status("[bold blue]Analyzing Track B..."):
        analysis_b = analyze_track(song_b)
    console.print(f"  Track B: {analysis_b['bpm']} BPM, key {analysis_b['key']}")

    compat = are_compatible(analysis_a, analysis_b)
    console.print(f"  Compatibility: [cyan]{compat['recommendation']}[/cyan] (BPM diff: {compat['bpm_diff']})")

    # Separate stems
    with console.status("[bold magenta]Separating stems (Track A)... this takes a minute"):
        stems_a = separate_stems(song_a, str(STEMS_DIR / "a"))
    console.print("  ✓ Track A stems separated")

    with console.status("[bold magenta]Separating stems (Track B)..."):
        stems_b = separate_stems(song_b, str(STEMS_DIR / "b"))
    console.print("  ✓ Track B stems separated")

    # Mix
    if output is None:
        name_a = Path(song_a).stem[:20]
        name_b = Path(song_b).stem[:20]
        output = str(OUTPUT_DIR / f"mashup_{name_a}_x_{name_b}.mp3")

    with console.status("[bold green]Creating mashup..."):
        create_mashup(stems_a, stems_b, analysis_a, analysis_b, output, vocals_from=vocals_from)

    console.print(f"\n[bold green]✓ Mashup saved:[/bold green] {output}")
    console.print(f"  Vocals from: Track {'A' if vocals_from == 'a' else 'B'}")
    console.print(f"  Target BPM: {analysis_b['bpm'] if vocals_from == 'a' else analysis_a['bpm']}")


@app.command()
def search(query: str = typer.Argument(..., help="Search query"), limit: int = typer.Option(5, "--limit", "-n")):
    """Search for tracks online."""
    with console.status(f"[bold blue]Searching for '{query}'..."):
        results = search_tracks(query, limit=limit)

    if not results:
        console.print("[red]No results found.[/red]")
        return

    table = Table(title=f"🔍 Results for '{query}'")
    table.add_column("#", style="dim")
    table.add_column("Title", style="cyan")
    table.add_column("Artist", style="green")
    table.add_column("Duration", style="yellow")
    for i, t in enumerate(results, 1):
        dur = f"{t['duration']//60}:{t['duration']%60:02d}" if t.get("duration") else "?"
        table.add_row(str(i), t["title"], t["uploader"], dur)
    console.print(table)


@app.command()
def auto(
    vibe: str = typer.Argument(..., help="Describe the vibe: 'chill house', 'hype rap', etc."),
    count: int = typer.Option(2, "--count", "-n", help="Number of tracks to find and mix"),
):
    """Auto-DJ: describe a vibe and get an instant mashup."""
    console.print(Panel(f"🦞 [bold]Auto DJ Mode[/bold] — Vibe: {vibe}", subtitle=f"Finding {count} tracks"))

    # Search for tracks matching the vibe
    with console.status(f"[bold blue]Finding tracks for '{vibe}'..."):
        results = search_tracks(f"{vibe} music", limit=count * 2)

    if len(results) < 2:
        console.print("[red]Couldn't find enough tracks. Try a different vibe.[/red]")
        raise typer.Exit(1)

    # Download top 2
    tracks = []
    for i, r in enumerate(results[:count]):
        with console.status(f"[bold blue]Downloading: {r['title']}..."):
            path = search_and_download(r["title"], str(DOWNLOAD_DIR))
            tracks.append(path)
            console.print(f"  ✓ [{i+1}/{count}] {r['title']}")

    if len(tracks) < 2:
        console.print("[red]Failed to download enough tracks.[/red]")
        raise typer.Exit(1)

    # Analyze
    analyses = []
    for i, t in enumerate(tracks):
        with console.status(f"[bold blue]Analyzing track {i+1}..."):
            analyses.append(analyze_track(t))
        console.print(f"  Track {i+1}: {analyses[-1]['bpm']} BPM, {analyses[-1]['key']}")

    # Separate and mix first two
    with console.status("[bold magenta]Separating stems..."):
        stems_a = separate_stems(tracks[0], str(STEMS_DIR / "auto_a"))
        stems_b = separate_stems(tracks[1], str(STEMS_DIR / "auto_b"))

    output = str(OUTPUT_DIR / f"auto_{vibe.replace(' ', '_')}.mp3")
    with console.status("[bold green]Creating mashup..."):
        create_mashup(stems_a, stems_b, analyses[0], analyses[1], output)

    console.print(f"\n[bold green]✓ Auto mashup ready:[/bold green] {output}")


if __name__ == "__main__":
    app()
