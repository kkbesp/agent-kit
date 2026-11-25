#!/bin/bash
# Статусная строка Claude Code, одна короткая строка:
# модель · папка (ветка) · контекст: занято% │ 5ч: осталось% ↻до сброса │ 7д: осталось% ↻до сброса
input=$(cat)
now=$(date +%s)
j() { echo "$input" | jq -r "$1 // empty"; }

R=$'\033[0m'; D=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; X=$'\033[31m'; C=$'\033[36m'

# цвет по занятому проценту
col() { if [ "$1" -ge 85 ]; then printf '%s' "$X"; elif [ "$1" -ge 60 ]; then printf '%s' "$Y"; else printf '%s' "$G"; fi; }

left_t() {
  local s=$1 d h m
  [ "$s" -le 0 ] && { printf '0м'; return; }
  d=$((s / 86400)); h=$(((s % 86400) / 3600)); m=$(((s % 3600) / 60))
  if [ "$d" -gt 0 ]; then printf '%dд%dч' "$d" "$h"
  elif [ "$h" -gt 0 ]; then printf '%dч%02dм' "$h" "$m"
  else printf '%dм' "$m"; fi
}

seg() { # $1 подпись, $2 окно
  local used resets pct
  used=$(j ".rate_limits.$2.used_percentage"); resets=$(j ".rate_limits.$2.resets_at")
  [ -z "$used" ] && return
  pct=$(printf '%.0f' "$used")
  printf '%s%s%s %s%d%%%s' "$D" "$1" "$R" "$(col "$pct")" "$((100 - pct))" "$R"
  [ -n "$resets" ] && printf '%s ↻%s%s' "$D" "$(left_t $((resets - now)))" "$R"
}

model=$(j '.model.display_name')
dir=$(j '.workspace.current_dir'); dir=${dir:-$(j '.cwd')}
ctx=$(printf '%.0f' "$(j '.context_window.used_percentage' || echo 0)" 2>/dev/null); ctx=${ctx:-0}

out="${C}${model}${R}"
if [ -n "$dir" ]; then
  out+=" ${D}${dir##*/}${R}"
  if br=$(git -C "$dir" branch --show-current 2>/dev/null) && [ -n "$br" ]; then
    [ -n "$(git -C "$dir" status --porcelain 2>/dev/null | head -1)" ] && br+="*"
    out+="${D}:${br}${R}"
  fi
fi
out+=" ${D}контекст${R} $(col "$ctx")${ctx}%${R}"

s5=$(seg 5ч five_hour); s7=$(seg 7д seven_day)
sep=" ${D}│${R} "
[ -n "$s5" ] && out+="$sep$s5"
[ -n "$s7" ] && out+="$sep$s7"
[ -z "$s5$s7" ] && out+="${sep}${D}лимиты после 1-го ответа${R}"
printf '%s\n' "$out"
