(function (root) {
  "use strict";

  function createIconImageData(size) {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    const center = size / 2;

    context.fillStyle = "#1a2237";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "#49d69a";
    context.lineWidth = Math.max(2, size / 10);
    context.beginPath();
    context.arc(center, center, size * 0.3, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#54a7ff";
    context.beginPath();
    context.arc(center, center, size * 0.1, 0, Math.PI * 2);
    context.fill();

    return context.getImageData(0, 0, size, size);
  }

  function createActionIcons(sizes = [16, 32]) {
    return Object.fromEntries(sizes.map(size => [size, createIconImageData(size)]));
  }

  root.WebRTCMonitorIcon = { createActionIcons };
})(typeof globalThis === "object" ? globalThis : self);
