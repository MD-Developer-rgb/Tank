THE LAST FIVE NIGHTS - OFFLINE PLAYCANVAS
=========================================
The game loads the PlayCanvas engine from the internet:
  https://cdn.jsdelivr.net/npm/playcanvas/build/playcanvas.min.js

If that is not reachable it automatically tries:
  lib/playcanvas.min.js   (this folder)

To play fully offline:
 1. On a computer with internet open
      https://cdn.jsdelivr.net/npm/playcanvas/build/playcanvas.min.js
    in your browser and save the page as  playcanvas.min.js
    (or: npm pack playcanvas  -> take package/build/playcanvas.min.js).
 2. Put the file in this folder so the path is  lib/playcanvas.min.js
 3. Reload the game.

If neither source works the game shows an on-screen error explaining this.
