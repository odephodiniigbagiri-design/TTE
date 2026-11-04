#!/bin/sh
# Prepares a NotebookLM video for the website:
#   - crops out NotebookLM's corner label (bottom strip), zooming in ~4% (works for landscape AND portrait videos)
#   - trims the start and the length you give (to skip any intro slide and the closing "Gemini Notebook" card)
#   - puts the TTE logo at the top-left for the whole video
# Usage:   sh add_logo.sh input.mp4 output.mp4 START_SECONDS LENGTH_SECONDS
# Example: sh add_logo.sh notebooklm.mp4 intro2.mp4 0 57.3
# Needs ffmpeg + ffprobe, and logo-watermark.png in the same folder as this script.
in="$1"; out="$2"; ss="${3:-0}"; dur="$4"
[ -z "$in" ] || [ -z "$out" ] && { echo "Usage: sh add_logo.sh input.mp4 output.mp4 START LENGTH"; exit 1; }
dim=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$in")
W=${dim%x*}; H=${dim#*x}
# crop away the bottom 3.75% (where the label sits), keeping the same shape, then scale back up
set -- $(awk -v w="$W" -v h="$H" 'BEGIN{ch=int(h*0.9625/2)*2; cw=int(ch*w/h/2)*2; x=int((w-cw)/2/2)*2; lw=(w>h)?w*0.11:w*0.15; m=w*0.02; printf "%d %d %d %d %d %d", cw, ch, x, int(lw), int(m), int(m*0.85)}')
cw=$1; ch=$2; cx=$3; lw=$4; mx=$5; my=$6
d=""; [ -n "$dur" ] && d="-t $dur"
ffmpeg -y -ss "$ss" $d -i "$in" -i "$(dirname "$0")/logo-watermark.png" \
  -filter_complex "[0:v]crop=${cw}:${ch}:${cx}:0,scale=${W}:${H}[v];[1:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=0.92[l];[v][l]overlay=${mx}:${my}[o]" \
  -map "[o]" -map 0:a -af "afade=t=in:d=0.1" \
  -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$out"
