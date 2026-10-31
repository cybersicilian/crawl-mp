/* Dedicated native 32px Shell Dash art, isolated from generated atlas indices.
 * Rendered from the task's existing GUI sprite; native bytes sha256: 2a6619681858b242e4561ee3e9318f2eaf1e5de731f3d6f196300e92742cb08b */
define([], function () {
    "use strict";
    var image = document.createElement("img");
    image.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACwElEQVR4AcSWvWoUURTHj18PoKCNigTEQsQkEh8gdgoWKTTYiBCshBDBDT6C7PoR0lhIGhUkWlgI2pkHcDFGxEKERYyNgj6Ais7vwn84c7l3ZrJRsuS3597zdf9zdmaz222LX40Crs1N/9kMTdeXFOAPpMHSo5c2DNTGvfB5kgJI8AeyH4Y2PbIChjlwmJpSQNOohmlOzdqTGUwgdUYpgIw2IyNP7Nzx03IoRzbXuyJAyRuxr55dtxTqMXpuKSyZBISNewsCGI3zNS511SSuDwaWQjlY8hACrEFnBgE4GBG2LU8Xpw3uPH9jMVa8iIliW/nzZ5UCKhmJDVciGPmBkZFw8PuPP+zS1FgF28CrImBkfNSg+6BnMfTUFWnk+FL4iRCXcNbfV3uYkooAee/efmgxitH88uKKAVeP/92nL+aZOLHXgBggHJuiImCwumYxn9/2DXxxtzNpgO/i+SN27ND+CvcffyDUioqAXAVXALl4nZ+J1cVbCaCBbjrWGjfrHP3X3yqhr/0F0+eP7c2fDvHWAkJ28cbnzoih2Bp2vrdiHvzkAes6kgJ4EoAnIS4+eni3CWLcAzH4fQ57z57xjnW6L4IrKSBEijeehMLU/jHqmFTBvok54+A4lhTgnwQVrBdfuVfPjBljFYrlLPmQi+NPCiDgmZpdNsCn0WLZN0Ed5PIaBfz6vcsg1QARmoa3+H0+9YAv/hgaBVDkYaQCP4d57s1Omo+TU0cpYObCqfB/QHc/T4CHJoxSsM+hHGwqh7PkDwJuLixvkwPL3R9z8PiECXL4Yrp1Zcpi8BNn5IJ9jM4MAhT0d3/dmvyTZ29YDuJtqQhgNKKuga6szqpeP8PUF6sYthTASASB/4H6Y9W/FCDHv7b+d2Cqd1YAoxKpwjY+1WNz+UkBjEhQSINhoFZ9sOxjkgJ8EoWbwfdKrf8CAAD//4mCa+sAAAAGSURBVAMAnWxQX/nqcWIAAAAASUVORK5CYII=";
    return { create: function () {
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        canvas.className = "power-art"; canvas.dataset.nativeTile = "-2";
        canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Shell Dash");
        function draw() {
            var ctx = canvas.getContext("2d"); if (!ctx) return;
            ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 32, 32); ctx.drawImage(image, 0, 0);
            canvas.setAttribute("data-power-art", "native");
        }
        if (image.complete && image.naturalWidth) draw(); else image.addEventListener("load", draw, { once: true });
        return canvas;
    } };
});
