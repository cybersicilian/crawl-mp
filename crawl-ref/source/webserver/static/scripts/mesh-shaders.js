define(["mesh-fluid", "mesh-look"], function (fluid, look) {
    "use strict";
    var vertex = [
        "attribute vec3 aPosition; attribute vec3 aNormal; attribute vec2 aUV; attribute float aShade;",
        "uniform mat4 uMatrix; uniform mat4 uShadowMatrix;",
        "varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUV; varying float vShade; varying vec4 vShadow;",
        "void main(){ vWorld=aPosition; vNormal=aNormal; vUV=aUV; vShade=aShade;",
        "vShadow=uShadowMatrix*vec4(aPosition,1.0); gl_Position=uMatrix*vec4(aPosition,1.0); }"
    ].join("\n");
    var depth = [
        "precision highp float; uniform sampler2D uTexture; varying vec2 vUV;",
        "vec4 pack(float d){ vec4 s=fract(d*vec4(16777216.0,65536.0,256.0,1.0)); return s-s.xxyz*vec4(0.0,0.00390625,0.00390625,0.00390625); }",
        "void main(){ if(texture2D(uTexture,vUV).a<0.4) discard; gl_FragColor=pack(gl_FragCoord.z); }"
    ].join("\n");
    function fragment(bump) {
        return (bump ? "#extension GL_OES_standard_derivatives : enable\n" : "") + [
            "precision highp float; uniform sampler2D uTexture; uniform sampler2D uShadow;",
            fluid.glsl.declarations,
            look.glsl,
            "uniform vec3 uEye; uniform vec4 uLightPos[4]; uniform vec4 uLightColor[4];",
            "uniform sampler2D uNormalRoughness;uniform vec4 uDetail;uniform vec4 uGold;",
            "uniform vec3 uTint; uniform vec4 uSurface; uniform vec4 uMaterial; uniform vec3 uOptical; uniform float uShadowEnabled;",
            "uniform vec4 uContacts[24]; uniform int uContactCount;",
            "varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUV; varying float vShade; varying vec4 vShadow;",
            "float unpack(vec4 d){return dot(d,vec4(0.000000059604645,0.000015258789,0.00390625,1.0));}",
            "const float PI=3.14159265;",
            "float ggx(float nh,float r){float a=r*r;float a2=a*a;float d=nh*nh*(a2-1.0)+1.0;return a2/max(PI*d*d,0.00001);}",
            "float smith(float nv,float r){float k=(r+1.0)*(r+1.0)/8.0;return nv/(nv*(1.0-k)+k);}",
            "vec3 fresnel(float hv,vec3 f0){return f0+(1.0-f0)*pow(clamp(1.0-hv,0.0,1.0),5.0);}",
            "float visibility(vec3 normal){ if(uShadowEnabled<0.5)return 1.0; vec3 p=vShadow.xyz/vShadow.w*0.5+0.5;",
            "if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0)return 1.0;",
            "float bias=max(0.0007,0.002*(1.0-max(0.0,normal.y))); float sum=0.0;",
            "for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float d=unpack(texture2D(uShadow,p.xy+vec2(float(x),float(y))/1024.0));sum+=p.z-bias<=d?1.0:0.0;}return mix(0.23,1.0,sum/9.0);}",
            "void main(){ vec4 tex=texture2D(uTexture,vUV); if(tex.a<0.12)discard; vec3 n=normalize(vNormal);",
            fluid.glsl.color,
            bump ? [
                "if(uSurface.x>0.0&&uMaterial.z<0.5){float d=0.0025; vec3 w=vec3(0.299,0.587,0.114);",
                "float dx=dot(texture2D(uTexture,vUV+vec2(d,0.0)).rgb-texture2D(uTexture,vUV-vec2(d,0.0)).rgb,w);",
                "float dy=dot(texture2D(uTexture,vUV+vec2(0.0,d)).rgb-texture2D(uTexture,vUV-vec2(0.0,d)).rgb,w);",
                "vec3 dp1=dFdx(vWorld),dp2=dFdy(vWorld);vec2 st1=dFdx(vUV),st2=dFdy(vUV);",
                "vec3 t=dp1*st2.y-dp2*st1.y,b=-dp1*st2.x+dp2*st1.x;float tl=length(t),bl=length(b);",
                "if(tl>0.000001&&bl>0.000001)n=normalize(n-(t/tl*dx+b/bl*dy)*uSurface.x);}"].join("\n") : "",
            fluid.glsl.normal,
            "vec4 detail=vec4(0.5,0.5,1.0,1.0);if(uDetail.x>0.5){detail=texture2D(uNormalRoughness,vUV);",
            "vec3 tangent=abs(n.y)<0.99?normalize(vec3(n.z,0.0,-n.x)):vec3(1.0,0.0,0.0);vec3 bitangent=normalize(cross(n,tangent));",
            "vec3 mapped=detail.rgb*2.0-1.0;mapped.xy*=uDetail.y;n=normalize(tangent*mapped.x+bitangent*mapped.y+n*mapped.z);}",
            "vec3 ambient=meshAmbient(n);vec3 light=ambient;",
            "vec3 eye=normalize(uEye-vWorld);float shadow=visibility(n);float rough=clamp(uMaterial.x,0.14,1.0);float metal=clamp(uMaterial.y,0.0,1.0);if(uDetail.x>0.5)rough=clamp(detail.a,0.2,1.0);",
            fluid.glsl.roughness,
            "float goldGrain=0.0;if(uGold.x>0.5){goldGrain=fract(sin(dot(floor(vWorld*max(1.0,uGold.y)),vec3(12.9898,78.233,39.425)))*43758.5453);metal=1.0;rough=clamp(rough*(0.9+goldGrain*0.2),0.17,0.4);}",
            "vec3 albedo=pow(tex.rgb,vec3(2.2))*uTint;vec3 f0=uGold.x>0.5?vec3(1.0,0.766,0.336):mix(vec3(0.04),albedo,metal);vec3 direct=vec3(0.0),reflections=vec3(0.0);float nv=max(0.05,dot(n,eye));",
            "for(int i=0;i<4;i++){vec3 delta=uLightPos[i].xyz-vWorld;float dist=length(delta);vec3 dir=delta/max(0.01,dist);",
            "float attenuation=uLightColor[i].a/(1.0+dist*dist*0.16);float lambert=max(0.0,dot(n,dir));",
            "float occ=i==0?shadow:1.0;light+=uLightColor[i].rgb*attenuation*(0.1+lambert*0.9)*occ;",
            "vec3 h=normalize(dir+eye);float nh=max(0.0,dot(n,h));vec3 f=fresnel(max(0.0,dot(h,eye)),f0);",
            "vec3 spec=ggx(nh,rough)*smith(nv,rough)*smith(lambert,rough)*f/max(4.0*nv*lambert,0.001);",
            "if(uGold.x>0.5)spec*=1.0+uGold.z*pow(max(0.0,nh),32.0)*(0.7+goldGrain*0.3);vec3 diffuse=(vec3(1.0)-f)*(1.0-metal)*albedo/PI;direct+=(diffuse+spec)*uLightColor[i].rgb*attenuation*3.0*lambert*occ;reflections+=spec*uLightColor[i].rgb*attenuation*lambert*occ;}",
            "float contact=1.0; if(vWorld.y<0.13&&n.y>0.4){for(int i=0;i<24;i++){if(i>=uContactCount)break;",
            "vec4 c=uContacts[i];vec2 q=(vWorld.xz-c.xy)/max(0.03,c.z);float falloff=exp(-dot(q,q)*2.2);contact*=1.0-falloff*c.w;}}",
            "float floorAO=mix(0.78,1.0,smoothstep(0.0,0.35,vWorld.y));",
            // Local pixel relief and restrained GGX highlights preserve native sprite palettes.
            "if(uMaterial.z>0.5){vec3 gain=clamp(vec3(0.69)+light*0.32,vec3(0.76),vec3(1.12));",
            "vec3 color=tex.rgb*uTint*gain*mix(1.0,contact,0.4)*vShade+tex.rgb*uSurface.w+clamp(reflections*uDetail.z,vec3(0.0),vec3(0.085));",
            "gl_FragColor=vec4(meshAtmosphere(color,vWorld,uEye),tex.a*uOptical.x);return;}",
            "vec3 ambientEnergy=albedo*ambient;if(uGold.x>0.5){ambientEnergy=mix(albedo,f0,0.32)*ambient*(0.92+0.08*pow(1.0-nv,5.0));}",
            "vec3 color=(ambientEnergy+direct)*vShade*contact*floorAO+albedo*uSurface.w+"+fluid.glsl.emission+"+"+fluid.glsl.reflection+";",
            fluid.glsl.absorption,
            "color=meshDisplay(color);",
            "float alpha="+fluid.glsl.opacity+";",
            "if(uOptical.y>0.0){float r=pow((uOptical.z-1.0)/(uOptical.z+1.0),2.0);float opticalView=clamp(abs(dot(n,eye)),0.0,1.0);float f=r+(1.0-r)*pow(1.0-opticalView,5.0);",
            "vec3 tint=max(tex.rgb*uTint,vec3(0.27));color=mix(tint,color,0.35)+vec3(f)*0.22;alpha=tex.a*clamp(uOptical.x*(1.0-uOptical.y*0.45)+f*0.3,0.04,0.88);}",
            "gl_FragColor=vec4(meshAtmosphere(color,vWorld,uEye),alpha); }"
        ].join("\n");
    }
    return { vertex: vertex, depth: depth, fragment: fragment };
});
