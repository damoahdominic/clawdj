#!/usr/bin/env python3
"""anysong — Download any song as a properly named MP3.

Usage:
    anysong "Lil Wayne Lollipop"
    anysong "Wild Thoughts Rihanna"
    anysong "Drake Hotline Bling" --dir ~/Music
    anysong "Bohemian Rhapsody" --quality 320
"""
import os
import sys
import re
import json
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

app = typer.Typer(name="anysong", help="🎵 Download any song as a properly named MP3", add_completion=False)
console = Console()

DEFAULT_DIR = Path.home() / "music"
DEEZER_API = "https://api.deezer.com"


def _sanitize_filename(name: str) -> str:
    """Make a string safe for filenames."""
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', '_', name.strip())
    name = name.lower()
    return name


def _deezer_search(query: str, limit: int = 5) -> list:
    """Search Deezer for tracks. Returns list of track metadata."""
    encoded = urllib.parse.quote(query)
    url = f"{DEEZER_API}/search?q={encoded}&limit={limit}"
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "anysong/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("data", [])
    except Exception as e:
        console.print(f"[yellow]Deezer search failed: {e}[/yellow]")
        return []


def _format_duration(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


def _build_filename(artist: str, title: str) -> str:
    """Build a clean filename: title_by_artist.mp3"""
    clean_title = _sanitize_filename(title)
    clean_artist = _sanitize_filename(artist)
    return f"{clean_title}_by_{clean_artist}.mp3"


def _download_from_youtube(search_query: str, output_path: str, quality: int = 320) -> bool:
    """Download audio from YouTube using yt-dlp."""
    env = os.environ.copy()
    deno_path = os.path.expanduser("~/.deno/bin")
    if os.path.isdir(deno_path):
        env["PATH"] = f"{deno_path}:{env.get('PATH', '')}"

    # Download to temp name first, then rename
    temp_template = output_path.replace(".mp3", ".%(ext)s")
    
    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--max-downloads", "1",
        "--no-playlist",
        "--match-filter", "duration<=600",
        "--output", temp_template,
        f"ytsearch1:{search_query}",
    ]

    # Check for cookies file
    cookies_path = os.path.expanduser("~/.anysong/cookies.txt")
    if os.path.isfile(cookies_path):
        cmd.extend(["--cookies", cookies_path])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
    
    if result.returncode != 0:
        stderr = result.stderr
        if "Sign in to confirm" in stderr or "bot" in stderr.lower():
            console.print("[red]YouTube bot detection triggered.[/red]")
            console.print("[yellow]Fix: Export cookies from your browser:[/yellow]")
            console.print("  mkdir -p ~/.anysong")
            console.print("  yt-dlp --cookies-from-browser chrome --cookies ~/.anysong/cookies.txt 'https://www.youtube.com'")
            return False
        console.print(f"[red]Download failed: {stderr[:200]}[/red]")
        return False

    # Verify file exists
    if os.path.isfile(output_path):
        return True
    
    # yt-dlp might have used a slightly different name
    parent = Path(output_path).parent
    stem = Path(output_path).stem
    for f in parent.glob("*.mp3"):
        if stem in f.stem or f.stem in stem:
            f.rename(output_path)
            return True

    # Find any recently created mp3
    mp3s = sorted(parent.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
    if mp3s:
        mp3s[0].rename(output_path)
        return True

    console.print("[red]Download completed but file not found.[/red]")
    return False


@app.command()
def download(
    query: str = typer.Argument(..., help="Song to download, e.g. 'Lil Wayne Lollipop'"),
    dir: str = typer.Option(None, "--dir", "-d", help="Output directory"),
    quality: int = typer.Option(320, "--quality", "-q", help="Audio quality (kbps)"),
    pick: bool = typer.Option(False, "--pick", "-p", help="Show results and let you pick"),
):
    """Download any song as a properly named MP3."""
    output_dir = Path(dir) if dir else DEFAULT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    console.print(Panel(f"🎵 [bold]anysong[/bold] — searching for: {query}"))

    # Step 1: Search Deezer for metadata
    with console.status("[bold blue]Searching Deezer for metadata..."):
        results = _deezer_search(query)

    if not results:
        console.print("[yellow]No Deezer results. Falling back to direct YouTube search.[/yellow]")
        filename = _sanitize_filename(query) + ".mp3"
        output_path = str(output_dir / filename)
        
        with console.status("[bold magenta]Downloading from YouTube..."):
            success = _download_from_youtube(query, output_path, quality)
        
        if success:
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            console.print(f"\n[bold green]✓ Downloaded:[/bold green] {output_path} ({size_mb:.1f} MB)")
        return

    # Step 2: Show results / auto-pick best
    if pick and len(results) > 1:
        table = Table(title="🔍 Search Results")
        table.add_column("#", style="dim", width=3)
        table.add_column("Title", style="cyan")
        table.add_column("Artist", style="green")
        table.add_column("Album", style="yellow")
        table.add_column("Duration", style="magenta")

        for i, track in enumerate(results, 1):
            table.add_row(
                str(i),
                track.get("title", "?"),
                track.get("artist", {}).get("name", "?"),
                track.get("album", {}).get("title", "?"),
                _format_duration(track.get("duration", 0)),
            )
        console.print(table)

        choice = typer.prompt("Pick a track", default="1")
        try:
            idx = int(choice) - 1
            track = results[idx]
        except (ValueError, IndexError):
            track = results[0]
    else:
        track = results[0]

    title = track.get("title", "Unknown")
    artist = track.get("artist", {}).get("name", "Unknown")
    album = track.get("album", {}).get("title", "")
    duration = track.get("duration", 0)

    console.print(f"  [cyan]Track:[/cyan]  {title}")
    console.print(f"  [green]Artist:[/green] {artist}")
    if album:
        console.print(f"  [yellow]Album:[/yellow]  {album}")
    console.print(f"  [magenta]Duration:[/magenta] {_format_duration(duration)}")

    # Step 3: Build clean filename
    filename = _build_filename(artist, title)
    output_path = str(output_dir / filename)

    if os.path.isfile(output_path):
        console.print(f"\n[yellow]Already exists:[/yellow] {output_path}")
        if not typer.confirm("Download again?", default=False):
            return

    # Step 4: Download from YouTube using Deezer metadata for precise search
    yt_query = f"{artist} {title} official audio"
    
    with console.status(f"[bold magenta]Downloading: {title} by {artist}..."):
        success = _download_from_youtube(yt_query, output_path, quality)

    if success:
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        console.print(f"\n[bold green]✓ Downloaded:[/bold green] {output_path}")
        console.print(f"  Size: {size_mb:.1f} MB | Quality: {quality}kbps")
    else:
        console.print(f"\n[red]✗ Failed to download {title}[/red]")


@app.command()
def search(
    query: str = typer.Argument(..., help="Search query"),
    limit: int = typer.Option(10, "--limit", "-n"),
):
    """Search for songs without downloading."""
    with console.status(f"[bold blue]Searching for '{query}'..."):
        results = _deezer_search(query, limit=limit)

    if not results:
        console.print("[red]No results.[/red]")
        return

    table = Table(title=f"🔍 Results for '{query}'")
    table.add_column("#", style="dim", width=3)
    table.add_column("Title", style="cyan")
    table.add_column("Artist", style="green")
    table.add_column("Album", style="yellow")
    table.add_column("Duration", style="magenta")
    table.add_column("Preview", style="dim")

    for i, track in enumerate(results, 1):
        table.add_row(
            str(i),
            track.get("title", "?"),
            track.get("artist", {}).get("name", "?"),
            track.get("album", {}).get("title", "?"),
            _format_duration(track.get("duration", 0)),
            "✓" if track.get("preview") else "✗",
        )
    console.print(table)


@app.command()
def preview(
    query: str = typer.Argument(..., help="Song to preview (30sec Deezer clip)"),
):
    """Play a 30-second preview from Deezer."""
    with console.status(f"[bold blue]Finding preview for '{query}'..."):
        results = _deezer_search(query, limit=1)

    if not results or not results[0].get("preview"):
        console.print("[red]No preview available.[/red]")
        return

    track = results[0]
    preview_url = track["preview"]
    title = track.get("title", "?")
    artist = track.get("artist", {}).get("name", "?")

    console.print(f"[cyan]Playing preview:[/cyan] {title} by {artist}")
    console.print(f"[dim]{preview_url}[/dim]")

    # Try to play with ffplay (from ffmpeg)
    try:
        subprocess.run(["ffplay", "-nodisp", "-autoexit", preview_url], 
                       capture_output=True, timeout=35)
    except FileNotFoundError:
        console.print("[yellow]ffplay not found. Install ffmpeg to play previews.[/yellow]")
        console.print(f"[dim]Preview URL: {preview_url}[/dim]")


@app.command()
def batch(
    file: str = typer.Argument(..., help="Text file with one song per line"),
    dir: str = typer.Option(None, "--dir", "-d", help="Output directory"),
):
    """Download multiple songs from a text file (one per line)."""
    output_dir = Path(dir) if dir else DEFAULT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    lines = Path(file).read_text().strip().splitlines()
    lines = [l.strip() for l in lines if l.strip() and not l.startswith("#")]

    console.print(f"[bold]Downloading {len(lines)} songs...[/bold]")

    success = 0
    failed = []
    for i, line in enumerate(lines, 1):
        console.print(f"\n[dim]({i}/{len(lines)})[/dim] {line}")
        try:
            # Search Deezer
            results = _deezer_search(line, limit=1)
            if results:
                track = results[0]
                title = track.get("title", "Unknown")
                artist = track.get("artist", {}).get("name", "Unknown")
                filename = _build_filename(artist, title)
                output_path = str(output_dir / filename)
                yt_query = f"{artist} {title} official audio"
            else:
                filename = _sanitize_filename(line) + ".mp3"
                output_path = str(output_dir / filename)
                yt_query = line

            if os.path.isfile(output_path):
                console.print(f"  [yellow]Skipped (exists):[/yellow] {filename}")
                success += 1
                continue

            ok = _download_from_youtube(yt_query, output_path)
            if ok:
                console.print(f"  [green]✓[/green] {filename}")
                success += 1
            else:
                failed.append(line)
        except Exception as e:
            console.print(f"  [red]✗ Error: {e}[/red]")
            failed.append(line)

    console.print(f"\n[bold]Done: {success}/{len(lines)} downloaded[/bold]")
    if failed:
        console.print(f"[red]Failed ({len(failed)}):[/red]")
        for f in failed:
            console.print(f"  - {f}")


if __name__ == "__main__":
    app()
