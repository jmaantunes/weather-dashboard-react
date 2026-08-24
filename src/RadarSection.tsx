import {useEffect, useMemo, useRef, useState} from "react";
import {LocateFixed, Pause, Play, RefreshCw, Radar as RadarIcon} from "lucide-react";
import type {Location} from "./types";

declare const L: any;

type RadarFrame={time:number;path:string};
type RadarFeed={generated:number;host:string;radar:{past:RadarFrame[]}};

const FEED="https://api.rainviewer.com/public/weather-maps.json";

function radarTile(host:string,path:string){
  return `${host}${path}/512/{z}/{x}/{y}/2/1_1.png`;
}
function timeLabel(unix:number){
  return new Date(unix*1000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
}

export default function RadarSection({loc}:{loc:Location}){
  const mapRef=useRef<HTMLDivElement|null>(null);
  const map=useRef<any>(null);
  const radarLayers=useRef<any[]>([]);
  const locationMarker=useRef<any>(null);
  const [feed,setFeed]=useState<RadarFeed|null>(null);
  const [frameIndex,setFrameIndex]=useState(-1);
  const [playing,setPlaying]=useState(false);
  const [opacity,setOpacity]=useState(.82);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  const frames=feed?.radar?.past??[];
  const currentFrame=frameIndex<0?frames.length-1:Math.min(frameIndex,Math.max(0,frames.length-1));
  const currentTime=frames[currentFrame]?.time;

  const loadFeed=async()=>{
    try{
      setLoading(true);setError("");
      const r=await fetch(`${FEED}?t=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)throw new Error(`Radar feed returned ${r.status}`);
      const json=await r.json() as RadarFeed;
      const past=(json.radar?.past??[]).filter(Boolean);
      if(!past.length)throw new Error("No recent radar frames are available.");
      setFeed({...json,radar:{past}});
      setFrameIndex(past.length-1);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load radar");}
    finally{setLoading(false)}
  };

  useEffect(()=>{loadFeed()},[]);

  useEffect(()=>{
    if(!mapRef.current||map.current||typeof L==="undefined")return;
    const m=L.map(mapRef.current,{zoomControl:false,preferCanvas:true,worldCopyJump:true}).setView([loc.latitude,loc.longitude],8);
    L.control.zoom({position:"topright"}).addTo(m);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(m);
    locationMarker.current=L.circleMarker([loc.latitude,loc.longitude],{radius:7,color:"#f4c95d",weight:2,fillColor:"#07111f",fillOpacity:1}).addTo(m);
    map.current=m;
    setTimeout(()=>m.invalidateSize(),50);
    return()=>{m.remove();map.current=null};
  },[]);

  useEffect(()=>{
    if(!map.current)return;
    map.current.setView([loc.latitude,loc.longitude],map.current.getZoom()??8,{animate:true});
    locationMarker.current?.setLatLng([loc.latitude,loc.longitude]);
    setTimeout(()=>map.current?.invalidateSize(),100);
  },[loc.latitude,loc.longitude]);

  useEffect(()=>{
    if(!map.current||!feed||!frames.length)return;
    radarLayers.current.forEach(layer=>layer.remove());
    radarLayers.current=[];
    frames.forEach((frame,index)=>{
      const layer=L.tileLayer(radarTile(feed.host,frame.path),{tileSize:512,maxNativeZoom:7,maxZoom:19,opacity:index===currentFrame?opacity:0,zIndex:300,updateWhenIdle:true,keepBuffer:2});
      layer.addTo(map.current);
      radarLayers.current.push(layer);
    });
    return()=>{radarLayers.current.forEach(layer=>layer.remove());radarLayers.current=[]};
  },[feed]);

  useEffect(()=>{
    radarLayers.current.forEach((layer,index)=>layer.setOpacity(index===currentFrame?opacity:0));
  },[currentFrame,opacity]);

  useEffect(()=>{
    if(!playing||frames.length<2)return;
    const id=window.setInterval(()=>{
      setFrameIndex(prev=>{
        const next=(prev+1)%frames.length;
        if(next===frames.length-1)window.setTimeout(()=>setPlaying(false),0);
        return next;
      });
    },750);
    return()=>window.clearInterval(id);
  },[playing,frames.length]);

  useEffect(()=>{
    if(!feed)return;
    const id=window.setInterval(loadFeed,5*60*1000);
    return()=>window.clearInterval(id);
  },[feed]);

  const timeline=useMemo(()=>frames.map((f,i)=>({f,i})),[frames]);

  return <section className="radarSection">
    <div className="radarHeader">
      <div>
        <div className="sectionEyebrow"><RadarIcon size={15}/> SECTION 3 · LIVE RADAR</div>
        <h2>Rain radar</h2>
        <p>Recent precipitation from RainViewer radar data. Scrub the timeline to watch rain cells move.</p>
      </div>
      <div className="radarHeaderActions">
        <span className="livePill"><i/> {currentTime?`RADAR ${timeLabel(currentTime)}`:"RADAR"}</span>
        <button className="iconButton" onClick={loadFeed} aria-label="Refresh radar"><RefreshCw size={16}/></button>
      </div>
    </div>

    <div className="radarMapShell">
      <div ref={mapRef} className="radarMap" />
      <div className="radarOverlayTop">
        <div className="radarLocationChip"><LocateFixed size={14}/><span>{loc.name}</span></div>
        <div className="radarLegend"><span>LIGHT</span><i className="legendGradient"/><span>HEAVY</span></div>
      </div>
      {loading&&<div className="radarLoading">Loading radar…</div>}
      {error&&<div className="radarError">{error}</div>}
      <div className="radarControls">
        <button className="playButton" onClick={()=>setPlaying(v=>!v)} disabled={frames.length<2} aria-label={playing?"Pause radar":"Play radar"}>{playing?<Pause size={17}/>:<Play size={17}/>}<span>{playing?"Pause":"Play"}</span></button>
        <div className="radarTimeline">
          <div className="timelineLabels"><span>{frames[0]?timeLabel(frames[0].time):"—"}</span><b>{currentTime?timeLabel(currentTime):"—"}</b><span>{frames.length?timeLabel(frames[frames.length-1].time):"—"}</span></div>
          <input aria-label="Radar timeline" type="range" min="0" max={Math.max(0,frames.length-1)} value={currentFrame<0?0:currentFrame} onChange={e=>{setPlaying(false);setFrameIndex(Number(e.target.value))}} disabled={!frames.length}/>
          <div className="timelineTicks">{timeline.map(({i})=><i key={i} style={{left:`${frames.length>1?(i/(frames.length-1))*100:0}%`}}/> )}</div>
        </div>
        <label className="opacityControl"><span>Opacity</span><input type="range" min="0.35" max="1" step="0.05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
      </div>
    </div>
    <div className="radarFoot"><span><b>Past 2 hours</b> · 10-minute radar frames</span><span>Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a></span></div>
  </section>
}
