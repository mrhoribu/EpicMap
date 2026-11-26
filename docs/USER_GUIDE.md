# EpicMap 1.2.5 - illustrated world and steady navigation

I wanted to see where the maps connect instead of figuring out the world one map at a time. EpicMap puts the world, towns, rooms, and hunting areas in one view. Set your level range to see where to hunt, or run the Lich script to follow your characters.

## Get it running

1. Put the `EpicMap` folder in your Lich folder.
2. Put `epicmap.lic` in `Lich5/scripts`.
3. Type `;epicmap` in game. The map opens in your browser.

For your other characters, use `;epicmap noopen`. They show up on the same map without opening more tabs. Stop the script with `;kill epicmap`.

You can also open `EpicMap/index.html` directly. The map and hunting finder work offline that way, but live tracking needs the script and http://localhost:7337.

Need another port? Use `;epicmap port=7444`. Need another map folder? Use `;epicmap dir=C:\path`. The included shortcuts use the default port, 7337.

## Getting around

- Scroll to zoom. Drag to move around. Double-click to zoom in.
- Click a town, room, hunting area, or map for details.
- `/` opens search. Search by room number, name, town, area, or creature.
- `T` changes the tilt. `F` follows your character. `H` takes you back out to the world.
- `+` and `-` zoom. Arrow keys move the view.
- Click the minimap to jump to another spot.
- Use the Live tab to pick which character to follow.

The Copy buttons copy a `;go2` command. Paste it in game when you're ready to move.

## Finding somewhere to hunt

Set the level range you want and pick a region, or leave it on all regions. Green is in range, red is above it, and blue is below it.

Turn on **all mobs in range** if you don't want mixed-level areas in the results. Click a creature to open its wiki page. An asterisk means its level came from HuntPlan without a matching wiki level in the bundled data.

Those are creature levels. Your build and gear still matter. The hunting list only covers the spawn data included with the map, and that data can get out of date.

## Live tracking

The first character running the script hosts the map. The others write their positions into `data/epicmap`. The map reads those files through the local server and shows each character's position and recent trail.

The server listens on `127.0.0.1`. The script reads your room through Lich; it doesn't move your characters or edit the map database.

## Map data and credits

- Rooms and exits: Lich `map-1793759004.json`, with 36,891 rooms.
- Area maps: Lich map images from the elanthia-online/mapdb-backup-gs mirror, plus the processed night versions included here.
- World artwork: Simutronics, `File:Elanthia.jpg` on gswiki.play.net, uploaded by GS4-HALISTE in 2017. The original package identifies this artwork for personal offline use.
- Illustrated atlas: AI-assisted terrain reillustration using the existing world artwork as reference. It is a decorative overview, not an official geographic survey. Native overview labels remain separate from the image. The original artwork is still selectable.
- Creatures and spawn rooms: HuntPlan. Creature entries keep their gswiki or HuntPlan level sources. The bundled metadata records an earlier wiki comparison.

The world layout isn't a distance scale. Some maps were moved apart so they don't overlap. Rooms without their own map can appear near a mapped neighbor. Interiors and pocket maps open in the area viewer.

Rebuild tools aren't included. Keep the artwork and data credits with the files.

## What's new in 1.2.5

- Issue #1: a new illustrated world background with shaded mountains, forests,
  rivers and coastal water replaces the blurry overview by default. Its labels
  are drawn separately and avoid interactive town/hunting labels. Choose
  Illustrated atlas, Minimal vector atlas, or Original artwork under Layers.
  The choice is remembered with your other preferences. The illustration is
  1435 x 1096 pixels; it is new artwork, not a claimed 4K upscale. Vector mode
  stays crisp at arbitrary scale and also provides the image-loading fallback.
- Issue #2: following between maps retains your chosen zoom, even during long
  pans or rapid position updates. Local area-map dialogs retain zoom too. The
  optional initial zoom-to-room applies only when explicitly enabling Follow.
- Issue #3: dragging does not disable Follow or change the selected character.
  Tracking yields while you drag or pinch, then resumes on the next character
  move. Click Follow or press F when you actually want to pause it.
- The wider 1.2.4 zoom range and existing preference/panel controls are retained.
  Room data, coordinates, hunting data and the Lich companion are unchanged.

The overview is illustrative. It does not add verified rivers, routes, exits,
warcamp boundaries or other navigation data. The original room/map data remain
the basis for every marker and copied go2 target.

Development checks: `npm test` runs the offline regressions. `npm run
test:browser` additionally needs Playwright and its Chromium browser, or set
`EPICMAP_BROWSER_CHANNEL=msedge` to use a separate headless Edge instance.

## Path trails

In the Live tab, use Clear trails to start a fresh visible trail for all tracked characters. New steps still show. Trail fades after defaults to 2 minutes; choose 30 seconds, 1, 2, 5, or 10 minutes, or Never. The browser remembers this setting when storage is available. Trail ages and resets last for the open page; reloading starts a new history.

## Choose who to follow

Use the character dropdown next to Follow. Picking a name turns following on and switches the camera to that character. The button shows the selected name, and the Live tab shows whether following is active or paused. You can also click a character in the Live tab.

The browser remembers your choice when storage is available. If that character disconnects, the map waits for them instead of switching to somebody else. Auto uses the server host when available. Press F or click Follow to pause or resume.

## Readability controls

The default view leaves original map images, full room links, animated effects, and individual room names off. Towns, room nodes, and location shading stay visible. Select a room to see its outgoing connections, or turn on all room connections in Layers.

Connected rooms with the same map and location title share a light color overlay. A single location label is placed outside the room cluster when there is room for it. Room titles remain available on hover. Location names, hunting names and levels, town names, individual room names, and character names have separate toggles.

Colors identify location groups. They are not warcamp markers, safe-hunting ratings, or exact surveyed boundaries. Hunting labels retain the bundled creature levels. Original images are still available from the details panel; their printed text is part of the image.

Reset to readable defaults restores this view. Main rendering is capped at 30 fps, minimap updates at 5 fps, and hidden pages skip rendering. These changes reduce browser drawing work; they do not establish the cause of Wrayth lag.

## In-range hunting glow

In-range hunting glow is on by default and has its own Layers toggle. It does not depend on film grain, character glow, room labels, hunting markers, or original map images. Eligible hunting areas glow green; detailed location outlines glow when their recorded spawn rooms include eligible creatures. Your level range, region filter, and all-mobs-in-range setting determine eligibility.

## Hide map panels

Click Hide at the top of Map controls to collapse the left panel, or Hide on the minimap to collapse it independently. Small Show controls and Show minimap buttons bring them back. B toggles the controls; M toggles the minimap. Shortcuts pause while typing or viewing an area dialog. Each visibility choice is remembered when browser storage is available. Hiding the controls preserves the hunting filters and in-range glow.

## Saved preferences

Open Layers > Preferences. Remember my preferences is on by default. Settings save automatically; Save now saves immediately. Turn it off to clear saved settings and use changes for this visit only. Reset preferences restores the defaults. Saved settings include hunting levels and region, strict matching, all layers, effects, tilt, zoom and position, tracking controls, selected character, trail duration, selected tab, area night ink, and panel visibility. Settings are local to this browser and site address, not synced between computers. If storage is unavailable, the map still works for the current visit.

## Wider zoom range

Zoom out four times farther in flat and 3D tilted views. The world-view starting position and maximum zoom-in are unchanged. Saved zoom preferences still work.
