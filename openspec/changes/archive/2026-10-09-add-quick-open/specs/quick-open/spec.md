# Spec Delta

## Purpose

Quick open lets the user switch to another Markdown file from the keyboard. They type part of its name instead of using the native file dialog. It draws on recently opened files and the files around the open document.

## ADDED Requirements

### Requirement: Open the palette with Ctrl+P
Pressing `Ctrl+P` (`Cmd+P` on macOS) SHALL open the quick open palette over the document. The palette has a focused filter field above a list of files. The shortcut MUST NOT open the system print dialog. Pressing it while the palette is open SHALL NOT open a second palette.

#### Scenario: Shortcut opens the palette
- **WHEN** the user presses `Ctrl+P` while editing
- **THEN** the quick open palette appears with the filter field focused and empty

#### Scenario: No print dialog
- **WHEN** the user presses `Ctrl+P` on any platform
- **THEN** no print dialog opens

#### Scenario: Works in source mode
- **WHEN** source mode is on and the user presses `Ctrl+P`
- **THEN** the quick open palette appears

### Requirement: Files listed
The palette SHALL list recently opened files and the Markdown files in the open document's folder and its subfolders. Each file appears at most once. The document that is open now is not listed. Only files with the extensions Margin opens (`.md`, `.markdown`, `.mdown`, `.mkd`, `.txt`) are listed.

#### Scenario: Folder files are listed
- **WHEN** `/notes/a.md` is open, the folder `/notes` contains `b.md` and `ideas/c.md`, and the user opens the palette
- **THEN** the list contains `b.md` and `ideas/c.md`, and does not contain `a.md`

#### Scenario: Non-Markdown files are left out
- **WHEN** the open document's folder also contains `photo.png` and `script.js`
- **THEN** neither appears in the palette

#### Scenario: A recent file in the folder appears once
- **WHEN** `/notes/b.md` is both a recent file and in the open document's folder
- **THEN** it appears exactly once in the list

#### Scenario: Untitled document
- **WHEN** the document is untitled and the user opens the palette
- **THEN** the list contains only recent files

#### Scenario: Nothing to show
- **WHEN** there are no recent files and no other Markdown files in the folder
- **THEN** the palette shows a short message saying there are no files to open

### Requirement: Folder scan limits
The folder listing SHALL skip hidden folders (names starting with `.`) and `node_modules`, and SHALL NOT follow symbolic links to folders. When a folder holds more Markdown files than the palette lists (5,000), it SHALL list that many and say the list is incomplete.

#### Scenario: Hidden and dependency folders are skipped
- **WHEN** the open document's folder contains `.git/notes.md` and `node_modules/pkg/README.md`
- **THEN** neither file appears in the palette

#### Scenario: Very large folder
- **WHEN** the open document is in a folder tree with more than 5,000 Markdown files
- **THEN** the palette lists 5,000 of them and shows a note that not all files are listed

#### Scenario: Symlink loop
- **WHEN** the folder contains a symbolic link that points to one of its parent folders
- **THEN** the palette opens normally and lists each file once

### Requirement: How files are shown
Each entry SHALL show the file name prominently, with its location in quieter text next to it. For a file inside the open document's folder, the location is the subfolder relative to that folder (empty for the folder itself). For other recent files, the location is the full folder path, with the home folder shortened to `~`. Windows paths SHALL be shown with their native separators.

#### Scenario: File in a subfolder
- **WHEN** `/notes/a.md` is open and `/notes/ideas/c.md` is listed
- **THEN** the entry shows `c.md` with the location `ideas`

#### Scenario: Recent file elsewhere
- **WHEN** `/home/max/work/plan.md` is a recent file outside the open document's folder
- **THEN** the entry shows `plan.md` with the location `~/work`

#### Scenario: Windows path
- **WHEN** `C:\Users\max\notes\todo.md` is a recent file on Windows
- **THEN** its location is shown with backslashes

### Requirement: Order with an empty filter
With an empty filter, the palette SHALL list recent files first, most recently opened first. Folder files that are not recent follow, sorted by relative path. The first entry is selected.

#### Scenario: Recents come first
- **WHEN** the user opened `x.md` and then `y.md` (both recent), and the folder also contains `a.md`
- **THEN** the list order is `y.md`, `x.md`, `a.md`, with `y.md` selected

### Requirement: Fuzzy filtering
Typing in the filter field SHALL narrow the list to files whose relative path contains the typed characters in order, ignoring case. Spaces separate parts that must each match. Results SHALL be ranked by match quality. Matches in the file name rank above matches only in the folder path, and consecutive or word-start matches rank higher. Ties go to the more recently opened file, then to alphabetical order. The best match is selected.

#### Scenario: Subsequence match
- **WHEN** the user types `qkop` and `todo/quick-open.md` is listed
- **THEN** `todo/quick-open.md` remains in the list

#### Scenario: Case-insensitive
- **WHEN** the user types `readme`
- **THEN** `README.md` remains in the list

#### Scenario: File name beats folder
- **WHEN** the user types `plan` and both `plan.md` and `plan/notes.md` are listed
- **THEN** `plan.md` is ranked above `plan/notes.md`

#### Scenario: Space-separated parts
- **WHEN** the user types `ideas c`
- **THEN** `ideas/c.md` remains, and `c.md` in the top folder does not

#### Scenario: No matches
- **WHEN** the typed text matches no file
- **THEN** the list is empty and the palette says nothing matches

#### Scenario: Matched characters are highlighted
- **WHEN** the filter matches part of an entry
- **THEN** the matched characters are visibly emphasized in that entry

### Requirement: Keyboard and mouse control
In the palette, `↓`/`Ctrl+N` and `↑`/`Ctrl+P` SHALL move the selection, wrapping at the ends. The selected entry is scrolled into view. `Enter` SHALL open the selected file. `Esc` SHALL close the palette without opening anything. Clicking an entry SHALL open it, and clicking outside the palette SHALL close it. When the palette closes, focus returns to the editor.

#### Scenario: Navigate and open
- **WHEN** the user presses `↓` twice and then `Enter`
- **THEN** the third file in the list is opened and the palette closes

#### Scenario: Wraps around
- **WHEN** the first entry is selected and the user presses `↑`
- **THEN** the last entry is selected

#### Scenario: Escape cancels
- **WHEN** the user presses `Esc`
- **THEN** the palette closes, the same document stays open, and the cursor is back in the editor where it was

#### Scenario: Click to open
- **WHEN** the user clicks an entry
- **THEN** that file opens and the palette closes

#### Scenario: Enter with nothing listed
- **WHEN** the list is empty and the user presses `Enter`
- **THEN** nothing is opened and the palette stays open

### Requirement: Opening a file
Opening a file from the palette SHALL behave like opening it with `Ctrl+O`. A document with a path is saved first. An unsaved untitled document asks before it is discarded, and declining keeps the user on it. If the chosen file no longer exists, Margin SHALL show an error, SHALL NOT create an empty document at that path, and SHALL remove it from the recent files.

#### Scenario: Pending edits are saved
- **WHEN** the current file has unsaved edits and the user opens another file from the palette
- **THEN** the edits are saved to the current file before the other file opens

#### Scenario: Untitled draft, user keeps editing
- **WHEN** the document is untitled with text, the user picks a file, and answers "Keep editing" when asked
- **THEN** the untitled document stays open with its text

#### Scenario: File deleted since it was listed
- **WHEN** the user picks a file that was deleted after the palette opened
- **THEN** an error message appears, the current document stays open, and the file is no longer among the recent files

### Requirement: Recent files history
Margin SHALL remember the files the user opens or saves under a new name, most recent first, across restarts. It keeps up to 50 files. Opening a file moves it to the front. Recent files that no longer exist SHALL NOT be listed in the palette.

#### Scenario: Remembered across restarts
- **WHEN** the user opens `a.md`, quits Margin, starts it again with another file and opens the palette
- **THEN** `a.md` is listed among the recent files

#### Scenario: Save as adds to recents
- **WHEN** the user saves an untitled document as `new.md`, then opens another file
- **THEN** `new.md` is listed among the recent files

#### Scenario: Deleted files are not shown
- **WHEN** a recent file has been deleted from disk and the user opens the palette
- **THEN** that file is not listed

#### Scenario: Bounded history
- **WHEN** the user has opened 60 different files
- **THEN** only the 50 most recent are remembered
