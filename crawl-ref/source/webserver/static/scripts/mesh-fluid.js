/* Native-texture fluid treatment. No scene reads, replacement art or animation loop.
 * Transparent water reveals only a visible-cell basin supplied by grid-water. */
define([],function(){
    "use strict";
    function phase(milliseconds,settings){
        settings=settings||{};
        if(settings.reducedMotion||settings.animated===false||settings.realtime!==true||settings.waterAnimation!==true)return 0;
        var cycle=100*Math.PI*2*1000;
        return Number.isFinite(milliseconds)?((milliseconds%cycle+cycle)%cycle)/1000:0;
    }
    function volume(profile){
        if(!profile||profile.kind!=="water")return null;
        return {surface:-.035,depth:profile.depth==="deep"?1.15:.28};
    }
    function uniforms(profile,shore,time,depthEdges){
        profile=profile||{};shore=shore||[0,0,0,0];
        var basin=volume(profile);
        return {depthEdges:new Float32Array([0,1,2,3].map(function(index){
            var depth=depthEdges&&depthEdges[index];return Number.isFinite(depth)?Math.max(0,Math.min(2,depth)):basin?basin.depth:0;
        })),volume:new Float32Array([basin?basin.depth:0,profile.murky?1:0,0,0]),fluid:new Float32Array([profile.kind==="honey"?3:profile.kind==="lava"?2:profile.kind==="water"?1:0,
            profile.depth==="deep"?1:0,profile.murky?1:0,Number.isFinite(profile.strength)?Math.max(0,Math.min(2,profile.strength)):1]),
            shore:new Float32Array([0,1,2,3].map(function(index){return shore[index]?1:0;})),
            time:Number.isFinite(time)?time:0};
    }
    var declarations=[
        "uniform vec4 uFluid; uniform vec4 uFluidShore; uniform vec4 uFluidVolume; uniform vec4 uFluidDepthEdges; uniform float uFluidTime;",
        "float meshFluidDepth(vec3 point){",
        " vec2 q=fract(point.xz);vec4 distance=vec4(q.y,1.0-q.x,1.0-q.y,q.x);",
        " vec4 weight=(vec4(1.0)-smoothstep(vec4(0.0),vec4(0.35),distance))*0.5;",
        " return uFluidVolume.x*(1.0-dot(weight,vec4(1.0)))+dot(weight,uFluidDepthEdges); }",
        "float meshFluidRoughness(float roughness,vec3 point){",
        " if(uFluid.x<0.5||uFluid.x>1.5)return roughness;",
        " float depth=clamp((meshFluidDepth(point)-0.28)/0.87,0.0,1.0);",
        " return mix(mix(0.24,0.17,depth),0.36,uFluid.z); }",
        "vec4 meshFluidBanks(vec3 point){",
        " vec2 q=fract(point.xz);vec4 distance=vec4(q.y,1.0-q.x,1.0-q.y,q.x);",
        " return (vec4(1.0)-smoothstep(vec4(0.0),vec4(0.14),distance))*uFluidShore; }",
        "float meshFluidShore(vec3 point){",
        " vec4 bank=meshFluidBanks(point);return max(max(bank.x,bank.y),max(bank.z,bank.w)); }",
        "vec3 meshFluidNormal(vec3 normal,vec3 point){",
        " if(uFluid.x<0.5||normal.y<0.5)return normal;",
        " float water=1.0-step(1.5,uFluid.x);float honey=step(2.5,uFluid.x);",
        " float amplitude=mix(0.025,mix(0.045,0.075,clamp((meshFluidDepth(point)-0.28)/0.87,0.0,1.0))*(1.0-uFluid.z*0.45),water);",
        " amplitude=mix(amplitude,0.022,honey);float speed=mix(mix(0.20,1.0,water),0.08,honey);",
        " vec2 p=point.xz;float t=uFluidTime*speed;",
        " vec2 wave=vec2(cos(p.x*3.2+p.y*1.8+t*0.75),sin(p.x*-1.7+p.y*3.6-t*0.50));",
        " wave+=vec2(sin(p.x*7.1-p.y*2.4-t*1.25),cos(p.x*2.8+p.y*6.3+t))*mix(0.12,0.28,water);",
        " vec4 bank=meshFluidBanks(point);vec2 meniscus=vec2(bank.w-bank.y,bank.x-bank.z);",
        " vec2 slope=(wave*amplitude+meniscus*mix(0.018,0.10,honey))*uFluid.w;",
        " return normalize(normal+vec3(slope.x,0.0,slope.y)); }",
        "vec3 meshFluidColor(vec3 nativeColor,vec3 point){",
        " if(uFluid.x<0.5)return nativeColor;float edge=meshFluidShore(point);",
        " if(uFluid.x>1.5&&uFluid.x<2.5)return nativeColor*(1.0-edge*0.07*uFluid.w);",
        " float honey=step(2.5,uFluid.x);float speed=mix(1.2,0.10,honey);",
        " float ripple=0.65+0.35*sin((point.x+point.z)*10.0-uFluidTime*speed);",
        " float highlight=edge*ripple*mix(0.035,0.018,clamp((meshFluidDepth(point)-0.28)/0.87,0.0,1.0))*(1.0-uFluid.z*0.5)*uFluid.w;",
        " vec3 tint=mix(vec3(0.75,0.90,1.0),vec3(1.0,0.78,0.30),honey);",
        " return clamp(nativeColor+highlight*tint*(0.35+nativeColor*0.65),0.0,1.0); }",
        // Beer-Lambert attenuation follows actual basin depth and a bounded view path.
        "vec3 meshFluidAbsorption(vec3 color,vec3 normal,vec3 eye,vec3 point){",
        " if(uFluid.x<0.5||uFluid.x>1.5)return color;",
        " float depth=meshFluidDepth(point);float path=depth/max(0.22,abs(dot(normal,eye)));",
        " vec3 extinction=mix(vec3(0.34,0.13,0.075),vec3(0.65,0.4,0.52),uFluidVolume.y);",
        " return color*exp(-extinction*path); }",
        "float meshFluidOpacity(float alpha,vec3 normal,vec3 eye,vec3 point){",
        " if(uFluid.x<0.5||uFluid.x>1.5)return alpha;",
        " float depth=meshFluidDepth(point);float path=depth/max(0.22,abs(dot(normal,eye)));",
        " if(alpha>0.999)return alpha;alpha=clamp(alpha+(depth-uFluidVolume.x)*0.38*(1.0-uFluid.z),0.0,0.98);",
        " return 1.0-(1.0-alpha)*exp(-path*mix(0.2,0.65,uFluidVolume.y)); }",
        "vec3 meshFluidEmission(vec3 nativeColor,vec3 point){",
        " if(uFluid.x<1.5||uFluid.x>2.5)return vec3(0.0);",
        " float hot=max(nativeColor.r-nativeColor.g*0.65,nativeColor.r-nativeColor.b*0.75);",
        " float seam=smoothstep(0.30,0.78,hot)*smoothstep(0.28,0.85,nativeColor.r);",
        " float pulse=0.94+0.06*sin(point.x*2.7+point.z*1.9+uFluidTime*0.35);",
        " return pow(nativeColor,vec3(2.2))*seam*pulse*1.35*uFluid.w; }",
        // Analytic, dim environment fill only. No sky, scene texture, unseen actors or traced rays.
        // The caller supplies linear native albedo and visible ambient irradiance, then applies normal fog.
        "vec3 meshFluidReflection(vec3 albedo,vec3 normal,vec3 toEye,vec3 ambient){",
        " if(uFluid.x<0.5||normal.y<0.5)return vec3(0.0);",
        " float water=1.0-step(1.5,uFluid.x);float honey=step(2.5,uFluid.x);",
        " float facing=clamp(dot(normal,normalize(toEye)),0.0,1.0);",
        " float f0=mix(0.025,0.04,honey);float fresnel=f0+(1.0-f0)*pow(1.0-facing,5.0);",
        " float up=clamp(reflect(-normalize(toEye),normal).y*0.5+0.5,0.0,1.0);",
        " vec3 tint=mix(vec3(0.65,0.76,0.90),vec3(0.95,0.72,0.32),honey);",
        " vec3 fill=max(ambient,vec3(0.0))*tint*(0.35+0.65*up);",
        " float strength=mix(mix(0.025,0.20,water),0.25,honey)*(1.0-uFluid.z*0.55);",
        " return fill*(0.30+0.70*albedo)*fresnel*strength*uFluid.w; }"
    ].join("\n");
    return {phase:phase,volume:volume,uniforms:uniforms,glsl:{declarations:declarations,
        normal:"n=meshFluidNormal(n,vWorld);",
        roughness:"rough=meshFluidRoughness(rough,vWorld);",
        absorption:"color=meshFluidAbsorption(color,n,eye,vWorld);",
        opacity:"meshFluidOpacity(tex.a*uOptical.x,n,eye,vWorld)",
        color:"tex.rgb=meshFluidColor(tex.rgb,vWorld);",
        emission:"meshFluidEmission(tex.rgb,vWorld)",
        reflection:"meshFluidReflection(albedo,n,eye,ambient)"}};
});
