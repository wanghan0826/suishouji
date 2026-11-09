# Game room identities

Landlord uses the existing nine original Mahjong chibi portraits. A stable hash of the visible player name selects the same portrait on every client. Opponents, the current player and occupied lobby seats use the same selection. The shared avatar stylesheet and Mahjong table are unchanged.

Drawing players are shown as their current room nickname plus their permanent entry number (`seat + 1`). Rank is separate from this number. Rejoining the same room preserves the number; other players leaving or changing score never renumbers it. Long names truncate while the number stays visible. All visible player names, answers, guessed notifications and score rows use this identity.

The audience bar has a **改昵称** button. A player can change their own nickname during an active room, using 1–20 Unicode code points with no line breaks or invisible control characters. Names are rendered as text. The name is stored only in `draw_members.nickname` for that room; registration names and account IDs remain available in the server database. Another room defaults to the registration name. Existing rooms receive an additive column with an empty default on startup.

`POST /api/draw-game/:token/nickname` uses the existing authenticated, CSRF-protected write path. It updates only the requesting active member, disallows ended rooms, allows six requests per minute per account, and broadcasts the new room state. Repeating an unchanged nickname does not bump the room version. Renaming preserves the round, canvas, timer and scores. The dialog clears on account or room change.

Verification: API tests cover room isolation, account binding, persistent migration/restart, fixed seats and rejoining, SSE updates, historical answer labels, text validation, CSRF, membership, ended rooms and request rate. Browser checks cover multiple clients, harmless HTML-like nicknames, long names, dialog and toolbar geometry, and both games on portrait and landscape phone dimensions.
