package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

const version = "0.1.0"

// Track represents a song in the library with analysis metadata
type Track struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Artist    string  `json:"artist"`
	Filename  string  `json:"filename"`
	Path      string  `json:"path"`
	BPM       float64 `json:"bpm"`
	Key       string  `json:"key"`
	Camelot   string  `json:"camelot"`
	Energy    float64 `json:"energy"`
	Duration  float64 `json:"duration_sec"`
	BeatCount int     `json:"beat_count"`
	AddedAt   string  `json:"added_at"`
}

// Library is the collection of analyzed tracks
type Library struct {
	Tracks  []Track `json:"tracks"`
	Updated string  `json:"updated"`
}

var (
	musicDir   string
	libraryDir string
	libFile    string
	backendDir string
	anysongBin string
)

func init() {
	home, _ := os.UserHomeDir()
	musicDir = filepath.Join(home, "music")
	libraryDir = filepath.Join(home, ".clawdj")
	libFile = filepath.Join(libraryDir, "library.json")
	backendDir = filepath.Join(home, "clawdj", "backend")

	// Find anysong binary
	if p, err := exec.LookPath("anysong"); err == nil {
		anysongBin = p
	} else {
		// Check common locations
		for _, candidate := range []string{
			filepath.Join(home, "anysong", "anysong"),
			"/usr/local/bin/anysong",
		} {
			if fileExists(candidate) {
				anysongBin = candidate
				break
			}
		}
	}
}

func main() {
	rootCmd := &cobra.Command{
		Use:   "clawdj",
		Short: "🦞 ClawDJ — AI-powered DJ mashup engine",
		Long:  "AI-powered DJ that downloads, analyzes, and mixes songs automatically.",
	}

	// --- add ---
	var addDir string
	addCmd := &cobra.Command{
		Use:   "add [query or file]",
		Short: "Add a song to the library (downloads if needed, then analyzes)",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			dir := addDir
			if dir == "" {
				dir = musicDir
			}
			addTrack(args[0], dir)
		},
	}
	addCmd.Flags().StringVarP(&addDir, "dir", "d", "", "Music directory")

	// --- library ---
	var libSortBy string
	var libFilterKey string
	var libFilterBPM float64
	libraryCmd := &cobra.Command{
		Use:     "library",
		Aliases: []string{"lib", "ls"},
		Short:   "Show your music library",
		Run: func(cmd *cobra.Command, args []string) {
			showLibrary(libSortBy, libFilterKey, libFilterBPM)
		},
	}
	libraryCmd.Flags().StringVar(&libSortBy, "sort", "added", "Sort by: bpm, key, energy, title, added")
	libraryCmd.Flags().StringVar(&libFilterKey, "key", "", "Filter by Camelot key (e.g. 5B)")
	libraryCmd.Flags().Float64Var(&libFilterBPM, "bpm", 0, "Filter by BPM (±8 range)")

	// --- analyze ---
	analyzeCmd := &cobra.Command{
		Use:   "analyze [file or query]",
		Short: "Analyze a track (BPM, key, energy)",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			analyzeTrack(args[0])
		},
	}

	// --- mix ---
	var mixVocals string
	var mixOutput string
	mixCmd := &cobra.Command{
		Use:   "mix [song_a] [song_b]",
		Short: "Mix two songs — vocals from one, beat from the other",
		Args:  cobra.ExactArgs(2),
		Run: func(cmd *cobra.Command, args []string) {
			mixTracks(args[0], args[1], mixVocals, mixOutput)
		},
	}
	mixCmd.Flags().StringVarP(&mixVocals, "vocals", "v", "a", "Take vocals from track a or b")
	mixCmd.Flags().StringVarP(&mixOutput, "output", "o", "", "Output file path")

	// --- set ---
	var setVibe string
	var setDuration string
	var setCount int
	setCmd := &cobra.Command{
		Use:   "set",
		Short: "Auto-generate a DJ set from your library",
		Run: func(cmd *cobra.Command, args []string) {
			generateSet(setVibe, setDuration, setCount)
		},
	}
	setCmd.Flags().StringVar(&setVibe, "vibe", "", "Describe the vibe (e.g. 'chill hip hop')")
	setCmd.Flags().StringVar(&setDuration, "duration", "15m", "Target duration (e.g. 30m, 1h)")
	setCmd.Flags().IntVarP(&setCount, "count", "n", 4, "Number of tracks")

	// --- compatible ---
	compatCmd := &cobra.Command{
		Use:   "compatible [song]",
		Short: "Find tracks in your library compatible with a song",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			findCompatible(args[0])
		},
	}

	rootCmd.AddCommand(addCmd, libraryCmd, analyzeCmd, mixCmd, setCmd, compatCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// --- Library Management ---

func loadLibrary() Library {
	var lib Library
	data, err := os.ReadFile(libFile)
	if err != nil {
		return Library{Tracks: []Track{}}
	}
	json.Unmarshal(data, &lib)
	if lib.Tracks == nil {
		lib.Tracks = []Track{}
	}
	return lib
}

func saveLibrary(lib Library) {
	os.MkdirAll(libraryDir, 0755)
	lib.Updated = time.Now().UTC().Format(time.RFC3339)
	data, _ := json.MarshalIndent(lib, "", "  ")
	os.WriteFile(libFile, data, 0644)
}

func findTrackInLibrary(lib Library, query string) *Track {
	q := strings.ToLower(query)
	for i, t := range lib.Tracks {
		if strings.ToLower(t.Title) == q ||
			strings.ToLower(t.Filename) == q ||
			strings.Contains(strings.ToLower(t.Title+" "+t.Artist), q) {
			return &lib.Tracks[i]
		}
	}
	return nil
}

// --- Commands ---

func addTrack(query, dir string) {
	os.MkdirAll(dir, 0755)

	var mp3Path string

	if fileExists(query) {
		// Local file
		mp3Path = query
		fmt.Printf("📁 Using local file: %s\n", query)
	} else {
		// Download via anysong
		fmt.Printf("🔍 Searching and downloading: %s\n", query)
		mp3Path = downloadViaAnysong(query, dir)
		if mp3Path == "" {
			fmt.Println("\033[31m✗ Download failed\033[0m")
			return
		}
	}

	// Check if already in library
	lib := loadLibrary()
	basename := filepath.Base(mp3Path)
	for _, t := range lib.Tracks {
		if t.Filename == basename {
			fmt.Printf("\033[33mAlready in library:\033[0m %s — %s (%s BPM, %s)\n",
				t.Title, t.Artist, fmt.Sprintf("%.0f", t.BPM), t.Camelot)
			return
		}
	}

	// Analyze
	fmt.Println("🎵 Analyzing...")
	analysis := runAnalysis(mp3Path)
	if analysis == nil {
		fmt.Println("\033[31m✗ Analysis failed\033[0m")
		return
	}

	track := Track{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Filename:  basename,
		Path:      mp3Path,
		BPM:       analysis.BPM,
		Key:       analysis.Key,
		Camelot:   analysis.Camelot,
		Energy:    analysis.Energy,
		Duration:  analysis.Duration,
		BeatCount: analysis.BeatCount,
		AddedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	// Try to extract title/artist from filename (title_by_artist.mp3)
	name := strings.TrimSuffix(basename, ".mp3")
	if parts := strings.SplitN(name, "_by_", 2); len(parts) == 2 {
		track.Title = strings.ReplaceAll(parts[0], "_", " ")
		track.Artist = strings.ReplaceAll(parts[1], "_", " ")
	} else {
		track.Title = strings.ReplaceAll(name, "_", " ")
		track.Artist = "Unknown"
	}

	lib.Tracks = append(lib.Tracks, track)
	saveLibrary(lib)

	fmt.Printf("\n\033[32m✓ Added to library:\033[0m %s — %s\n", track.Title, track.Artist)
	fmt.Printf("  BPM: %.0f | Key: %s (%s) | Energy: %.2f | Duration: %s\n",
		track.BPM, track.Key, track.Camelot, track.Energy, formatDur(track.Duration))
}

func showLibrary(sortBy, filterKey string, filterBPM float64) {
	lib := loadLibrary()
	if len(lib.Tracks) == 0 {
		fmt.Println("Library is empty. Add songs with: clawdj add \"Artist Song\"")
		return
	}

	tracks := lib.Tracks

	// Filter
	if filterKey != "" {
		var filtered []Track
		for _, t := range tracks {
			if strings.EqualFold(t.Camelot, filterKey) {
				filtered = append(filtered, t)
			}
		}
		tracks = filtered
	}
	if filterBPM > 0 {
		var filtered []Track
		for _, t := range tracks {
			if abs(t.BPM-filterBPM) <= 8 {
				filtered = append(filtered, t)
			}
		}
		tracks = filtered
	}

	// Sort
	switch sortBy {
	case "bpm":
		sort.Slice(tracks, func(i, j int) bool { return tracks[i].BPM < tracks[j].BPM })
	case "key":
		sort.Slice(tracks, func(i, j int) bool { return tracks[i].Camelot < tracks[j].Camelot })
	case "energy":
		sort.Slice(tracks, func(i, j int) bool { return tracks[i].Energy > tracks[j].Energy })
	case "title":
		sort.Slice(tracks, func(i, j int) bool { return tracks[i].Title < tracks[j].Title })
	}

	fmt.Printf("\n🦞 ClawDJ Library (%d tracks)\n\n", len(tracks))
	fmt.Println("  #  │ Title                │ Artist          │ BPM   │ Key  │ Energy │ Duration")
	fmt.Println("  ───┼──────────────────────┼─────────────────┼───────┼──────┼────────┼─────────")
	for i, t := range tracks {
		fmt.Printf("  %-3d│ %-20s │ %-15s │ %5.0f │ %-4s │ %5.2f  │ %s\n",
			i+1,
			truncate(t.Title, 20),
			truncate(t.Artist, 15),
			t.BPM,
			t.Camelot,
			t.Energy,
			formatDur(t.Duration),
		)
	}
	fmt.Println()
}

func analyzeTrack(query string) {
	var mp3Path string

	if fileExists(query) {
		mp3Path = query
	} else {
		// Check library first
		lib := loadLibrary()
		if t := findTrackInLibrary(lib, query); t != nil {
			fmt.Printf("\n🎵 %s — %s\n", t.Title, t.Artist)
			fmt.Printf("  BPM:      %.0f\n", t.BPM)
			fmt.Printf("  Key:      %s (%s)\n", t.Key, t.Camelot)
			fmt.Printf("  Energy:   %.4f\n", t.Energy)
			fmt.Printf("  Duration: %s\n", formatDur(t.Duration))
			fmt.Printf("  Beats:    %d\n", t.BeatCount)
			return
		}
		// Download
		fmt.Printf("🔍 Not in library, downloading: %s\n", query)
		mp3Path = downloadViaAnysong(query, musicDir)
		if mp3Path == "" {
			fmt.Println("\033[31m✗ Could not find track\033[0m")
			return
		}
	}

	fmt.Printf("🎵 Analyzing %s...\n", filepath.Base(mp3Path))
	analysis := runAnalysis(mp3Path)
	if analysis == nil {
		fmt.Println("\033[31m✗ Analysis failed\033[0m")
		return
	}

	fmt.Printf("\n  BPM:      %.0f\n", analysis.BPM)
	fmt.Printf("  Key:      %s (%s)\n", analysis.Key, analysis.Camelot)
	fmt.Printf("  Energy:   %.4f\n", analysis.Energy)
	fmt.Printf("  Duration: %s\n", formatDur(analysis.Duration))
	fmt.Printf("  Beats:    %d\n", analysis.BeatCount)
}

func mixTracks(songA, songB, vocalsFrom, output string) {
	pathA := resolveTrack(songA)
	pathB := resolveTrack(songB)
	if pathA == "" || pathB == "" {
		return
	}

	if output == "" {
		nameA := strings.TrimSuffix(filepath.Base(pathA), ".mp3")
		nameB := strings.TrimSuffix(filepath.Base(pathB), ".mp3")
		if len(nameA) > 20 {
			nameA = nameA[:20]
		}
		if len(nameB) > 20 {
			nameB = nameB[:20]
		}
		os.MkdirAll(filepath.Join(musicDir, "mashups"), 0755)
		output = filepath.Join(musicDir, "mashups", fmt.Sprintf("mashup_%s_x_%s.mp3", nameA, nameB))
	}

	fmt.Println("\n🦞 ClawDJ Mashup Engine")
	fmt.Printf("  Track A: %s\n", filepath.Base(pathA))
	fmt.Printf("  Track B: %s\n", filepath.Base(pathB))
	fmt.Printf("  Vocals from: Track %s\n\n", strings.ToUpper(vocalsFrom))

	// Call Python mixer
	script := fmt.Sprintf(`
import sys, os, json
sys.path.insert(0, '%s')
from services.separator import separate_stems
from services.analyzer import analyze_track, are_compatible
from services.mixer import create_mashup

print("  Analyzing Track A...", flush=True)
a_info = analyze_track('%s')
print(f"  → {a_info['bpm']:.0f} BPM, {a_info['key']} ({a_info['camelot']})")

print("  Analyzing Track B...", flush=True)
b_info = analyze_track('%s')
print(f"  → {b_info['bpm']:.0f} BPM, {b_info['key']} ({b_info['camelot']})")

compat = are_compatible(a_info, b_info)
print(f"  Compatibility: {compat['recommendation']} (BPM diff: {compat['bpm_diff']})")

print("\n  Separating stems (Track A)... this takes a minute", flush=True)
stems_a = separate_stems('%s', '/tmp/clawdj_stems/a')
print("  ✓ Track A stems done")

print("  Separating stems (Track B)...", flush=True)
stems_b = separate_stems('%s', '/tmp/clawdj_stems/b')
print("  ✓ Track B stems done")

print("\n  Mixing...", flush=True)
create_mashup(stems_a, stems_b, a_info, b_info, '%s', vocals_from='%s')
print(f"\n  ✓ Mashup saved: %s")
`, backendDir, pathA, pathB, pathA, pathB, output, vocalsFrom, output)

	cmd := exec.Command(filepath.Join(filepath.Dir(backendDir), "venv", "bin", "python"), "-c", script)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = backendDir

	if err := cmd.Run(); err != nil {
		fmt.Printf("\n\033[31m✗ Mix failed: %v\033[0m\n", err)
		return
	}

	fmt.Printf("\n\033[32m✓ Done!\033[0m %s\n", output)
}

func findCompatible(query string) {
	lib := loadLibrary()
	if len(lib.Tracks) == 0 {
		fmt.Println("Library is empty. Add songs first.")
		return
	}

	// Find the reference track
	var ref *Track
	if t := findTrackInLibrary(lib, query); t != nil {
		ref = t
	} else {
		fmt.Printf("\033[31m'%s' not found in library\033[0m\n", query)
		return
	}

	fmt.Printf("\n🔍 Tracks compatible with: %s — %s (%.0f BPM, %s)\n\n", ref.Title, ref.Artist, ref.BPM, ref.Camelot)

	compatible := camelotCompatible(ref.Camelot)

	type match struct {
		track Track
		score string
	}
	var matches []match

	for _, t := range lib.Tracks {
		if t.ID == ref.ID {
			continue
		}
		bpmOK := abs(t.BPM-ref.BPM) <= 8
		keyOK := contains(compatible, t.Camelot)

		if bpmOK && keyOK {
			matches = append(matches, match{t, "\033[32m★ great\033[0m"})
		} else if bpmOK {
			matches = append(matches, match{t, "\033[33m● good (BPM match)\033[0m"})
		} else if keyOK {
			matches = append(matches, match{t, "\033[33m● good (key match)\033[0m"})
		}
	}

	if len(matches) == 0 {
		fmt.Println("  No compatible tracks found. Add more songs!")
		return
	}

	for _, m := range matches {
		fmt.Printf("  %s │ %s — %s │ %.0f BPM │ %s\n",
			m.score, m.track.Title, m.track.Artist, m.track.BPM, m.track.Camelot)
	}
	fmt.Println()
}

func generateSet(vibe, duration string, count int) {
	lib := loadLibrary()
	if len(lib.Tracks) < 2 {
		fmt.Println("Need at least 2 tracks in library. Add more songs first.")
		return
	}

	fmt.Printf("\n🦞 Auto DJ — vibe: \"%s\", %d tracks\n\n", vibe, count)

	if count > len(lib.Tracks) {
		count = len(lib.Tracks)
	}

	// Simple set building: sort by energy, pick tracks, order by Camelot compatibility
	tracks := make([]Track, len(lib.Tracks))
	copy(tracks, lib.Tracks)

	// Sort by energy for selection
	sort.Slice(tracks, func(i, j int) bool { return tracks[i].Energy < tracks[j].Energy })

	// Pick evenly spaced tracks for energy curve
	selected := make([]Track, 0, count)
	step := len(tracks) / count
	if step == 0 {
		step = 1
	}
	for i := 0; i < len(tracks) && len(selected) < count; i += step {
		selected = append(selected, tracks[i])
	}

	// Order by Camelot for smooth transitions
	ordered := orderByCamelot(selected)

	fmt.Println("  Set order:")
	for i, t := range ordered {
		compat := ""
		if i > 0 {
			prev := ordered[i-1]
			if contains(camelotCompatible(prev.Camelot), t.Camelot) {
				compat = " \033[32m(harmonic ✓)\033[0m"
			} else {
				compat = " \033[33m(key jump)\033[0m"
			}
		}
		fmt.Printf("  %d. %s — %s │ %.0f BPM │ %s%s\n",
			i+1, t.Title, t.Artist, t.BPM, t.Camelot, compat)
	}

	fmt.Println("\n  Mixing transitions...")

	// Mix adjacent pairs and chain
	os.MkdirAll(filepath.Join(musicDir, "sets"), 0755)
	setName := "set"
	if vibe != "" {
		setName = strings.ReplaceAll(vibe, " ", "_")
	}

	// For now, mix the first pair as a demo
	if len(ordered) >= 2 {
		output := filepath.Join(musicDir, "sets", fmt.Sprintf("%s_%s.mp3", setName, time.Now().Format("20060102_150405")))
		mixTracks(ordered[0].Path, ordered[1].Path, "a", output)
	}
}

// --- Helpers ---

func downloadViaAnysong(query, dir string) string {
	if anysongBin == "" {
		// Try building it
		home, _ := os.UserHomeDir()
		anysongDir := filepath.Join(home, "anysong")
		if fileExists(filepath.Join(anysongDir, "main.go")) {
			fmt.Println("  Building anysong...")
			cmd := exec.Command("go", "build", "-o", filepath.Join(anysongDir, "anysong"), ".")
			cmd.Dir = anysongDir
			if err := cmd.Run(); err == nil {
				anysongBin = filepath.Join(anysongDir, "anysong")
			}
		}
		if anysongBin == "" {
			fmt.Println("\033[31m✗ anysong not found. Build it: cd ~/anysong && go build -o anysong .\033[0m")
			return ""
		}
	}

	// List files before download
	before := listMP3s(dir)

	cmd := exec.Command(anysongBin, "download", query, "--dir", dir)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return ""
	}

	// Find the new file
	after := listMP3s(dir)
	for _, f := range after {
		found := false
		for _, b := range before {
			if f == b {
				found = true
				break
			}
		}
		if !found {
			return f
		}
	}

	// If no new file, find most recently modified
	if len(after) > 0 {
		sort.Slice(after, func(i, j int) bool {
			infoI, _ := os.Stat(after[i])
			infoJ, _ := os.Stat(after[j])
			return infoI.ModTime().After(infoJ.ModTime())
		})
		return after[0]
	}

	return ""
}

type AnalysisResult struct {
	BPM       float64
	Key       string
	Camelot   string
	Energy    float64
	Duration  float64
	BeatCount int
}

func runAnalysis(mp3Path string) *AnalysisResult {
	script := fmt.Sprintf(`
import sys, json
sys.path.insert(0, '%s')
from services.analyzer import analyze_track
result = analyze_track('%s')
print(json.dumps(result))
`, backendDir, mp3Path)

	venvPython := filepath.Join(filepath.Dir(backendDir), "venv", "bin", "python")
	cmd := exec.Command(venvPython, "-c", script)
	cmd.Dir = backendDir
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			fmt.Printf("  \033[2mAnalysis error: %s\033[0m\n", string(exitErr.Stderr))
		}
		return nil
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil
	}

	return &AnalysisResult{
		BPM:       getFloat(raw, "bpm"),
		Key:       getString(raw, "key"),
		Camelot:   getString(raw, "camelot"),
		Energy:    getFloat(raw, "energy"),
		Duration:  getFloat(raw, "duration_sec"),
		BeatCount: int(getFloat(raw, "beat_count")),
	}
}

func resolveTrack(query string) string {
	if fileExists(query) {
		return query
	}

	// Check library
	lib := loadLibrary()
	if t := findTrackInLibrary(lib, query); t != nil {
		if fileExists(t.Path) {
			return t.Path
		}
	}

	// Check music dir
	entries, _ := os.ReadDir(musicDir)
	q := strings.ToLower(query)
	for _, e := range entries {
		if strings.Contains(strings.ToLower(e.Name()), q) && strings.HasSuffix(e.Name(), ".mp3") {
			return filepath.Join(musicDir, e.Name())
		}
	}

	// Download
	fmt.Printf("🔍 Downloading: %s\n", query)
	path := downloadViaAnysong(query, musicDir)
	if path == "" {
		fmt.Printf("\033[31m✗ Could not find: %s\033[0m\n", query)
	}
	return path
}

// Camelot wheel compatibility — adjacent keys mix well
func camelotCompatible(key string) []string {
	wheel := map[string][]string{
		"1A": {"1A", "1B", "12A", "2A"}, "1B": {"1B", "1A", "12B", "2B"},
		"2A": {"2A", "2B", "1A", "3A"}, "2B": {"2B", "2A", "1B", "3B"},
		"3A": {"3A", "3B", "2A", "4A"}, "3B": {"3B", "3A", "2B", "4B"},
		"4A": {"4A", "4B", "3A", "5A"}, "4B": {"4B", "4A", "3B", "5B"},
		"5A": {"5A", "5B", "4A", "6A"}, "5B": {"5B", "5A", "4B", "6B"},
		"6A": {"6A", "6B", "5A", "7A"}, "6B": {"6B", "6A", "5B", "7B"},
		"7A": {"7A", "7B", "6A", "8A"}, "7B": {"7B", "7A", "6B", "8B"},
		"8A": {"8A", "8B", "7A", "9A"}, "8B": {"8B", "8A", "7B", "9B"},
		"9A": {"9A", "9B", "8A", "10A"}, "9B": {"9B", "9A", "8B", "10B"},
		"10A": {"10A", "10B", "9A", "11A"}, "10B": {"10B", "10A", "9B", "11B"},
		"11A": {"11A", "11B", "10A", "12A"}, "11B": {"11B", "11A", "10B", "12B"},
		"12A": {"12A", "12B", "11A", "1A"}, "12B": {"12B", "12A", "11B", "1B"},
	}
	if compat, ok := wheel[key]; ok {
		return compat
	}
	return []string{key}
}

func orderByCamelot(tracks []Track) []Track {
	if len(tracks) <= 1 {
		return tracks
	}

	ordered := []Track{tracks[0]}
	remaining := tracks[1:]

	for len(remaining) > 0 {
		last := ordered[len(ordered)-1]
		compatible := camelotCompatible(last.Camelot)

		bestIdx := 0
		bestScore := 999.0
		for i, t := range remaining {
			score := abs(t.BPM - last.BPM)
			if contains(compatible, t.Camelot) {
				score -= 50 // heavily prefer harmonic matches
			}
			if score < bestScore {
				bestScore = score
				bestIdx = i
			}
		}

		ordered = append(ordered, remaining[bestIdx])
		remaining = append(remaining[:bestIdx], remaining[bestIdx+1:]...)
	}

	return ordered
}

func listMP3s(dir string) []string {
	var files []string
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".mp3") {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	return files
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

func formatDur(sec float64) string {
	m := int(sec) / 60
	s := int(sec) % 60
	return fmt.Sprintf("%d:%02d", m, s)
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func contains(list []string, item string) bool {
	for _, v := range list {
		if v == item {
			return true
		}
	}
	return false
}

func getFloat(m map[string]interface{}, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return 0
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
