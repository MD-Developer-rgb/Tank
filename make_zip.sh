#!/bin/sh
# Creates THE_LAST_FIVE_NIGHTS.zip from this folder (Linux / Mac / Termux)
cd "$(dirname "$0")" || exit 1
NAME=THE_LAST_FIVE_NIGHTS
rm -f "../$NAME.zip"
cd .. || exit 1
zip -r "$NAME.zip" "$NAME" -x "*/.DS_Store" "*/make_zip.*~" && echo "Created $(pwd)/$NAME.zip"
