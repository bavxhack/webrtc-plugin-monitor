#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${root_dir}/dist"
stage_dir="${dist_dir}/webrtc-live-monitor"
archive="${dist_dir}/webrtc-live-monitor.zip"

rm -rf "${stage_dir}" "${archive}" "${archive}.sha256"
mkdir -p "${stage_dir}/src"

cp "${root_dir}/manifest.json" "${root_dir}/popup.html" \
  "${root_dir}/popup.js" "${root_dir}/popup.css" "${stage_dir}/"
cp "${root_dir}/src/"*.js "${stage_dir}/src/"

(
  cd "${stage_dir}"
  zip -q -r "${archive}" .
)
sha256sum "${archive}" > "${archive}.sha256"

printf 'Created %s\n' "${archive}"
