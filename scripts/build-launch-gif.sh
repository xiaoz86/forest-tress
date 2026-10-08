#!/usr/bin/env bash
# Build a feature-highlight GIF from the static screenshots.
# 截图先用 scripts/capture-screenshots.mjs 截好（存在 public/launch-screenshots/<版本>/）。
# Output → public/launch-screenshots/feature-tour.gif（/launch 的头图和分享图都用它）
# 上一版（2026-05）的 GIF 留在 feature-tour-2026-05.gif，给存档的旧发布说明用。

set -e
DIR="public/launch-screenshots"
SRC="${SRC:-$DIR/2026-10}"
WORK="$DIR/_gif_frames"
mkdir -p "$WORK"

# Frames in display order (each gets 2.0s)：按导航走一遍，个人网站空间多停两张
FRAMES=(
  "01-home.png"
  "02-creators.png"
  "03-space.png"
  "13-space-offer.png"
  "04-space-tune.png"
  "06-square.png"
  "07-phil-coach.png"
  "09-meditations.png"
  "10-sky.png"
  "14-xiaoya.png"
)

# Re-encode every frame to a fixed 900×640 canvas (scale-fit + center-pad)
# so the GIF has a stable size across heterogeneous source aspects.
echo "Resizing frames…"
i=0
for f in "${FRAMES[@]}"; do
  i=$((i+1))
  out=$(printf "%s/f%02d.png" "$WORK" "$i")
  ffmpeg -y -i "$SRC/$f" \
    -vf "scale=w=900:h=640:force_original_aspect_ratio=decrease:flags=lanczos,pad=900:640:(ow-iw)/2:(oh-ih)/2:color=#fafaf7" \
    -loglevel error "$out"
done

# Concat list at 2s each
LIST="$WORK/list.txt"
> "$LIST"
for f in "$WORK"/f*.png; do
  echo "file '$(pwd)/$f'" >> "$LIST"
  echo "duration 2.0" >> "$LIST"
done
# Repeat last to honor duration
last="$(ls "$WORK"/f*.png | tail -1)"
echo "file '$(pwd)/$last'" >> "$LIST"

# Two-pass: palettegen → paletteuse for crisp GIF
PALETTE="$WORK/palette.png"
ffmpeg -y -f concat -safe 0 -i "$LIST" -vf "fps=10,palettegen=max_colors=128" -loglevel error "$PALETTE"
ffmpeg -y -f concat -safe 0 -i "$LIST" -i "$PALETTE" \
  -lavfi "fps=10[x];[x][1:v]paletteuse=dither=sierra2_4a" \
  -loop 0 -loglevel error "$DIR/feature-tour.gif"

# Cleanup intermediate
rm -rf "$WORK"

ls -lh "$DIR/feature-tour.gif"
echo "Done."
