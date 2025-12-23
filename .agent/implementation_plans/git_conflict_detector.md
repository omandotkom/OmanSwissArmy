# Implementation Plan - Git Conflict Detector

## Goal
Implement a "Git Conflict Detector" feature that allows developers to simulate a merge between two branches (Source vs Target) to identify potential conflicts without performing an actual merge.

## Proposed Architecture

### 1. Backend (Next.js API Routes)

#### A. List Branches Endpoint
- **Path:** `/api/git/branches`
- **Method:** `GET`
- **Functionality:** 
    - Executes `git branch -a` (or `git for-each-ref`) to get a list of all local and remote branches.
    - Returns a JSON list of branch names.

#### B. Simulate Merge Endpoint
- **Path:** `/api/git/simulate-merge`
- **Method:** `POST`
- **Body:** `{ sourceBranch: string, targetBranch: string }`
- **Functionality:**
    - Executes `git merge-tree --write-tree <targetBranch> <sourceBranch>` (order matters for "ours" vs "theirs", usually `git merge <source>` into `<target>`).
    - Captures standard output and exit code.
    - **Exit Code 0:** Clean merge. Identify safe status.
    - **Exit Code 1 (or non-zero):** Conflicts.
    - Parses the output to find conflicting files (files with conflict markers or listed in the info section).
    - Returns: `{ hasConflicts: boolean, conflictingFiles: string[], output: string }`.

### 2. Frontend (UI)

#### Page: `/git-conflict-detector`
- **Path:** `src/app/git-conflict-detector/page.tsx`
- **Components:**
    - **Branch Selectors:** Two dropdowns (Source Branch, Target Branch) populated by the `/api/git/branches` endpoint.
    - **Action Button:** "Simulate Merge" / "Check Conflicts".
    - **Status Display:**
        - **Scanning:** Loading spinner.
        - **Safe:** Green success message ("No conflicts detected. Safe to merge.").
        - **Conflict:** Red warning message ("Conflicts detected!").
        - **File List:** List of files that would generate conflicts.

### 3. Integration
- Add the new tool to `src/data/tools.ts` under "Development & Utils" or a new "Git / Version Control" category if appropriate (likely "DevOps & Cloud" or "Development & Utils").

## Step-by-Step Implementation

1.  **Create API: Get Branches** (`src/app/api/git/branches/route.ts`)
2.  **Create API: Simulate Merge** (`src/app/api/git/simulate-merge/route.ts`)
3.  **Create UI Page** (`src/app/git-conflict-detector/page.tsx`)
4.  **Register Tool** (`src/data/tools.ts`)
