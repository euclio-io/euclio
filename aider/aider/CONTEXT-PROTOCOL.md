# CONTEXT-PROTOCOL.md — Token Budget & File-Loading Rules

<!--
  PURPOSE (for the AI reading this):
  You operate inside a hard context window. You cannot load files yourself —
  the user runs /add, /read, and /drop — but YOU are responsible for telling
  the user exactly what to load, what to unload, and when. Follow this
  protocol on every task. Violating it causes request failures and wasted money.
-->

---

## 1. The budget

Assume this allocation of the context window unless told otherwise:

| Slice                          | Budget        |
|--------------------------------|---------------|
| System prompt + harness files  | ~8k tokens    |
| Repo map                       | ~2k tokens    |
| Chat history                   | ~4k tokens    |
| Working files (editable)       | ~10k tokens   |
| On-demand context docs         | ~6k tokens    |
| Reserved for your response     | ~4k tokens    |

Rules of thumb: 1 token ≈ 4 characters ≈ 0.75 words. A 300-line code file
is roughly 3–4k tokens. A dense markdown doc is ~1.5k tokens per 100 lines.

**Never let working files + context docs exceed ~16k tokens combined.**
When a new file is needed and the budget is full, something must be
dropped first — say which.

## 2. Before requesting any file

1. Check the repo map first. If the map already shows the signature or
   location you need, use it — don't request the file.
2. Estimate the file's cost from its line count (visible in the map or via
   `/run wc -l <file>`). State the estimate when asking.
3. Request ONE file at a time. Never "add A, B, C and D."
4. Distinguish the request type:
   - Need to EDIT it → ask the user to `/add <file>`
   - Need to REFERENCE it → ask for `/read <file>` (cheaper: cacheable,
     and signals it won't be modified)

## 3. Large files: never whole, always ranges

If a file exceeds ~400 lines, do NOT ask for the whole file. Extract only
the region you need using shell commands through `/run` (aider offers to
add command output to the chat — that's the mechanism):

- Locate first:
  `/run grep -n "functionName" path/to/file.js`
- Then pull only the relevant range:
  `/run sed -n '120,190p' path/to/file.js`
- Or a function with context:
  `/run grep -n -A 40 "function handleSubmit" path/to/file.js`

Iterate: locate → read range → if insufficient, read the adjacent range.
Never respond to "the range wasn't enough" by requesting the full file;
request the next range.

Exception: if you must EDIT a large file, it has to be added whole
(`/add`) — aider edits complete files. In that case, ask the user to
`/drop` other files first to make room, and flag the file as a refactor
candidate (see §6).

## 4. Unloading is your job too

- The moment a file is no longer needed for the current task, tell the
  user: "Done with X — you can `/drop path/to/x`."
- At the end of every task, list what can be dropped.
- If the conversation has gone long (many turns of back-and-forth), suggest
  `/clear` to wipe chat history while keeping files loaded — history is
  often the silent budget killer.
- If you notice loaded files that are irrelevant to the current task,
  say so proactively.

## 5. When the limit is hit anyway

If a request fails on context length, recover in this order (cheapest first):
1. `/clear` — drop chat history.
2. `/drop` all read-only docs not needed for THIS task.
3. `/drop` editable files not being edited right now.
4. Replace any whole large file with a `/run sed` range extract.
Never suggest raising the budget or switching endpoints as the first fix.

## 6. Structural fixes to flag

Context pressure is often an architecture smell. When you see these,
flag them (don't fix unprompted):
- A source file over ~500 lines → propose splitting by feature.
- A context doc over ~300 lines → propose a summary doc + full doc, with
  only the summary in standing context.
- The same file needed in every single task → maybe it belongs in the
  standing `read:` config instead of per-task adds.

---

<!--
  FOR THE HUMAN — your side of the protocol (the model can't run these):

  /tokens          → audit exactly what's consuming the window right now.
                     Run this whenever things feel heavy. It itemizes
                     system prompt, repo map, each file, and history.
  /drop <file>     → unload a file (no argument = drop everything)
  /clear           → wipe chat history, keep files
  /reset           → wipe both history and files

  Config knobs (.aider.conf.yml):
  max-chat-tokens: 4096   → auto-summarize chat history past this size
  map-tokens: 2048        → repo map budget

  And the blunt truth: if you hit limits with Sonnet's 200k window, the
  protocol isn't the problem — check the boot log; you're probably still
  on a 32k endpoint (the Qwen override). This protocol is about keeping
  context LEAN for cost and attention, not about squeezing into 32k.
-->