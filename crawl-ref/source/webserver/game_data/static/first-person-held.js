/* Sprite-derived foreground volumes. Animation follows native action-count deltas. */
define(["jquery", "sprite-voxels", "./first-person-equipment-art", "./first-person-loadout", "./first-person-hands-profile", "./first-person-hands", "./first-person-magic", "foreground-motion"],
function ($, voxels, equipmentArt, loadout, handProfile, handModule, magicModule, motionPose) {
    "use strict";
    var serial = 0;
    function create(host, options) {
        options = options || {};
        var root = document.createElement("div"), cache = new Map(), signature = "", animations = new Set();
        var tracker = loadout.tracker(), namespace = ".firstPersonHeld" + (++serial), active = false;
        var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        var artwork = equipmentArt.create(), poseFrame = null, heldViews = new Map();
        var hands = handModule.create(function () { signature = ""; if (options.onChange) options.onChange(); });
        root.className = "first-person-held"; root.hidden = true;
        root.setAttribute("role", "group"); root.setAttribute("aria-label", "Held equipment");
        var glow = document.createElement("canvas"); glow.className = "first-person-cast-glow"; glow.setAttribute("aria-hidden", "true");
        host.append(root);
        function paintHeld(kind,progress,groups) {
            var phase=Math.round(progress*20)/20;
            heldViews.forEach(function(view,canvas){
                var action=!groups||groups.has(view.group)?kind:"rest";
                var delta=motionPose.at(action,phase,canvas.dataset.side),key=[delta.yaw,delta.pitch,delta.roll].join(":");
                if(view.last===key)return;view.last=key;
                var pose=motionPose.anchor(view.pose,delta,view.pivot);
                view.currentPose=pose;
                canvas.getContext("2d").clearRect(0,0,512,512);voxels.paint(canvas.getContext("2d"),view.model,pose);
                canvas.dataset.wristYaw=String(delta.yaw);canvas.dataset.wristPitch=String(delta.pitch);
                if(view.support){var p=voxels.project(view.support,pose);canvas.dataset.supportGripX=String(pose.x+p[0]*pose.scale);canvas.dataset.supportGripY=String(pose.y-p[1]*pose.scale);}
            });
        }
        function settle() {
            if(poseFrame!==null)cancelAnimationFrame(poseFrame);poseFrame=null;
            paintHeld("rest",0);hands.pose("rest",0,0);root.removeAttribute("data-action");
        }
        function cancel() {
            animations.forEach(function (animation) { animation.cancel(); }); animations.clear();
            settle();
        }
        function animate(kind,spell) {
            if (!active || document.hidden || motion.matches || document.documentElement.dataset.graphicsMotion === "reduced" || !root.animate) return;
            cancel(); root.dataset.action = kind;
            if(kind==="cast"){
                magicModule.paint(glow,spell?spell.kind:"arcane");
                if(spell)glow.dataset.spellName=spell.name;else delete glow.dataset.spellName;
            }
            var main = root.querySelectorAll(".first-person-hand-group[data-side='main']"), offhand = root.querySelectorAll(".first-person-hand-group[data-side='offhand']");
            var clockAnimation=null,clockDuration=0,movingGroups=new Set();
            function play(element, frames, duration) {
                if(element.classList.contains("first-person-hand-group"))movingGroups.add(element);
                var animation = element.animate(frames, { duration: duration, easing: "ease-in-out" });
                if(duration>clockDuration){clockAnimation=animation;clockDuration=duration;}
                animations.add(animation); animation.onfinish = function () { animations.delete(animation); if (!animations.size) settle(); };
            }
            var rest = { transform: "translate(0, 0) rotate(0deg)", filter: "brightness(1)" };
            if (kind === "cast") {
                Array.from(root.querySelectorAll(".first-person-hand-group")).forEach(function (canvas) {
                    var left = canvas.dataset.side === "offhand";
                    play(canvas, [rest, { transform: "translate(" + (left ? "12%" : "-12%") + ", -12%) rotate(" + (left ? "-12" : "12") + "deg)", filter: "brightness(1.4)" }, rest], 480);
                });
                play(glow, [{ opacity: 0, transform: "scale(.6) rotate(-30deg)" }, { opacity: .9, offset: .45, transform: "scale(1) rotate(0deg)" }, { opacity: 0, transform: "scale(1.45) rotate(25deg)" }], 520);
            } else if (kind === "block") {
                Array.from(offhand).forEach(function (canvas) { play(canvas, [rest, { transform: "translate(16%, -12%) rotate(14deg)" }, rest], 280); });
            } else {
                var weapons = root.querySelectorAll(".first-person-hand-group[data-weapon='true']");
                var targets = weapons.length ? weapons : main.length ? main : offhand;
                Array.from(targets).forEach(function (canvas) {
                    var left = canvas.dataset.side === "offhand";
                    var claw = canvas.dataset.unarmed === "true" && /claws|paw|crab/.test(canvas.dataset.model || "");
                    var unarmed=canvas.dataset.unarmed==="true",strike;
                    if(kind==="fire")strike="translate(0, 9%) rotate(5deg)";
                    else if(kind==="throw")strike="translate("+(left?"16%":"-16%")+", -20%) rotate("+(left?"30":"-30")+"deg)";
                    else if(claw)strike="translate("+(left?"42%":"-42%")+", -30%) rotate("+(left?"24":"-24")+"deg)";
                    else if(unarmed)strike="translate("+(left?"30%":"-30%")+", -35%) rotate("+(left?"14":"-14")+"deg) scale(1.12)";
                    else strike="translate("+(left?"28%":"-28%")+", -22%) rotate("+(left?"36":"-36")+"deg)";
                    play(canvas, [rest, { transform: "translate(7%, -6%) rotate(10deg)", offset: .2 }, { transform: strike, offset: .55 }, rest], kind === "fire" ? 300 : 360);
                });
                if (targets.length === 0) play(glow, [{ opacity: 0 }, { opacity: .5 }, { opacity: 0 }], 220);
            }
            function poseTick() {
                poseFrame = null;
                var primary = animations.has(clockAnimation)?clockAnimation:animations.values().next().value;
                if (!primary) return;
                var timing = primary.effect.getComputedTiming(), progress = timing.progress;
                progress=Number.isFinite(progress)?progress:0;
                paintHeld(kind,progress,movingGroups);hands.pose(kind,Math.sin(progress*Math.PI),progress,movingGroups);
                poseFrame = requestAnimationFrame(poseTick);
            }
            if (animations.size) poseFrame = requestAnimationFrame(poseTick);
            else root.removeAttribute("data-action");
        }
        function update(player, hero, enabled) {
            active = Boolean(enabled); root.hidden = !active;
            var effect = tracker.update(hero);
            if (!active) { cancel(); return; }
            var entries = loadout.held(hero, player), descriptors = handProfile.describe(hero,player,entries);
            var next = JSON.stringify([entries,descriptors]);
            if (signature !== next) {
                cancel(); hands.clear(); heldViews.clear(); signature = next; root.replaceChildren();
                var counts = { main: 0, offhand: 0 };
                var groups = new Map();
                function group(side,entry,descriptor,attachment) {
                    var element=document.createElement("div");element.className="first-person-hand-group";
                    element.dataset.side=side;element.dataset.weapon=String(Boolean(entry&&entry.weapon));
                    element.dataset.unarmed=String(Boolean(descriptor&&descriptor.unarmed));
                    if(descriptor)element.dataset.model=descriptor.model;
                    element.style.setProperty("--held-order",String(counts[side]++));root.append(element);
                    if(descriptor)hands.attach(element,descriptor,attachment);
                    if(descriptor&&descriptor.magic) {
                        var magic=document.createElement("canvas");magic.className="first-person-ready-magic";
                        magic.dataset.school=descriptor.magic.kind;magic.dataset.blocked=String(descriptor.magic.blocked);
                        magicModule.paint(magic,descriptor.magic.kind);magic.setAttribute("role","img");magic.setAttribute("aria-label","Readied: "+descriptor.magic.name);
                        element.append(magic);
                    }
                    groups.set(side,element);return element;
                }
                entries.forEach(function (entry) {
                    var source = artwork.sample(entry); if (!source) { signature="";return; }
                    var key = source.key, model = cache.get(key);
                    if (!model) {
                        model = voxels.build(source.canvas.getContext("2d").getImageData(0,0,source.width,source.height).data,source.width,source.height,
                            { depth: entry.weapon ? 1.4 : 4, bevel: true, alignAxis: entry.weapon, dome: entry.weapon ? 0 : 1.8 });
                        if (!model) return;
                        if (cache.size >= 32) cache.delete(cache.keys().next().value); cache.set(key, model);
                    }
                    var canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
                    canvas.className = "first-person-held-item"; canvas.dataset.side = entry.side;
                    canvas.dataset.weapon = String(entry.weapon);
                    canvas.dataset.slot = String(entry.slot); canvas.dataset.voxels = String(model.voxels);
                    canvas.dataset.trimmed = String(model.trimmed); canvas.dataset.volume = "beveled";
                    canvas.dataset.sourceArt = source.source;
                    canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", (entry.side === "main" ? "Main hand: " : "Offhand: ") + entry.label);
                    var descriptor=descriptors.find(function(value){return value.side===entry.side;});
                    var pose = { yaw: entry.side === "main" ? -.38 : .52, pitch: -.16,
                        roll: entry.weapon && model.elongation > .3 ? (entry.side === "main" ? 1.35 : 1.79)-model.axis : -.06,
                        materialLighting: "source" };
                    var bounds = voxels.bounds(model,pose), scale = Math.min(440/bounds.height,440/bounds.width);
                    pose.scale = scale; pose.x = 256-(bounds.left+bounds.right)/2*scale;
                    // The grip/lowest edge enters the frame from below; no floating icon gap.
                    pose.y = 508+bounds.bottom*scale;
                    var pivot=entry.weapon?[0,-model.height*.32,0]:[0,0,0];
                    var view={model:model,pose:pose,currentPose:pose,pivot:pivot,last:"0:0:0"};
                    function attachment(point,kind){
                        var projected=voxels.project(point,pose);
                        return {target:[pose.x+projected[0]*scale,pose.y-projected[1]*scale],kind:kind,project:function(){
                            var current=view.currentPose,p=voxels.project(point,current);
                            return [current.x+p[0]*current.scale,current.y-p[1]*current.scale];
                        }};
                    }
                    var grip=attachment(pivot,entry.weapon?"handle":"center"),container=group(entry.side,entry,descriptor,grip);
                    canvas.dataset.gripX=String(grip.target[0]);canvas.dataset.gripY=String(grip.target[1]);
                    if(entry.hands===2){
                        var support=descriptors.find(function(value){return value.side!==entry.side;});
                        if(support){
                            view.support=[0,-model.height*.43,0];var supporting=attachment(view.support,"support");
                            hands.attach(container,support,supporting);groups.set(support.side,container);
                            canvas.dataset.supportGripX=String(supporting.target[0]);canvas.dataset.supportGripY=String(supporting.target[1]);
                        }
                    }
                    voxels.paint(canvas.getContext("2d"), model, pose);
                    view.group=container;heldViews.set(canvas,view);
                    container.append(canvas);
                });
                descriptors.forEach(function(descriptor){if(!groups.has(descriptor.side))group(descriptor.side,null,descriptor);});
                magicModule.paint(glow,"arcane");
                root.append(glow);
                root.dataset.count = String(root.querySelectorAll(".first-person-held-item").length);
            }
            if (effect) animate(effect,handProfile.cast(hero,tracker.detail()));
        }
        function clearCache() { signature = ""; hands.invalidate(); if (options.onChange) options.onChange(); }
        var images = $("#main, #icons, #player"); images.on("load" + namespace, clearCache);
        motion.addEventListener("change", cancel);
        $(document).on("texture_pack_changed" + namespace, clearCache)
            .on("visual_presentation_changed" + namespace, cancel)
            .on("visibilitychange" + namespace, function () { if (document.hidden) cancel(); });
        return { update: update, animate: animate, destroy: function () {
            cancel(); hands.destroy(); heldViews.clear(); tracker.reset(); cache.clear(); root.remove(); images.off(namespace); motion.removeEventListener("change", cancel); $(document).off(namespace);
        } };
    }
    return { create: create };
});
