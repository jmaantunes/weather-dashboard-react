import {useEffect,useMemo,useRef,useState} from "react";
import{CloudSun,ChevronDown,MapPin,RefreshCw,Sun,Thermometer,ThermometerSnowflake}from"lucide-react";
import*as echarts from"echarts";
import{archive,baseline,forecast,searchLocations}from"./api";
import type{Location,WeatherResponse}from"./types";
import{fmt,fmtWeekdayDate,icon,label,localToday,hourLabel,preciseTimeLabel,daysBefore}from"./weather";
import"./styles.css";

const fallback:Location={id:2267057,name:"Lisbon",country:"Portugal",country_code:"PT",latitude:38.7223,longitude:-9.1393,timezone:"Europe/Lisbon"};
const yearNow=new Date().getFullYear();

function isAbortError(e:unknown){return e instanceof DOMException&&e.name==="AbortError"}

function LocationPicker({loc,setLoc}:{loc:Location;setLoc:(x:Location)=>void}){
  const[v,setV]=useState(loc.name),[rs,setRs]=useState<Location[]>([]),[open,setOpen]=useState(false);
  useEffect(()=>setV(loc.name),[loc]);
  useEffect(()=>{if(v.length<2){setRs([]);return}const h=setTimeout(()=>searchLocations(v).then(setRs).catch(()=>setRs([])),250);return()=>clearTimeout(h)},[v]);
  return <div className="locationPicker">
    <button className="locationButton" onClick={()=>setOpen(x=>!x)}><span className="locationIcon"><MapPin size={16}/></span><span className="locationText"><small>LOCATION</small><b>{loc.name}, {loc.country_code}</b></span><ChevronDown size={15} className={open?"rot":""}/></button>
    {open&&<div className="locationPanel">
      <div className="locationPanelHead"><div><b>Choose location</b><small>Select a country or city used across the dashboard.</small></div></div>
      <div className="locationSearch"><MapPin size={15}/><input autoFocus value={v} onChange={e=>setV(e.target.value)} placeholder="City or country"/></div>
      <div className="locationResults">{rs.map(x=><button key={`${x.id}-${x.latitude}`} onMouseDown={()=>{setLoc(x);setV(x.name);setRs([]);setOpen(false)}}><MapPin size={14}/><span><b>{x.name}, {x.country_code}</b><small>{x.country}{x.admin1?` · ${x.admin1}`:""}</small></span></button>)}</div>
      {rs.length===0&&v.length>=2&&<div className="locationHint">Type to find a city or country.</div>}
    </div>}
  </div>
}

type Point={date:string;value:number;min?:number;max?:number};

/** Builds a stacked min→max filled band (plus dashed boundary lines) for one series category. */
function rangeSeries(seriesLabel:string,points:Point[],color:string,dash:"dashed"|"dotted"){
  const minData=points.map(p=>[p.date,p.min??null]);
  const maxData=points.map(p=>[p.date,p.max??null]);
  return [
    {name:`${seriesLabel} min`,type:"line",data:minData,smooth:.2,showSymbol:false,lineStyle:{width:1.25,type:dash,color,opacity:.7},itemStyle:{color},areaStyle:{opacity:0}},
    {name:`${seriesLabel} max`,type:"line",data:maxData,smooth:.2,showSymbol:false,lineStyle:{width:1.25,type:dash,color,opacity:.7},itemStyle:{color},areaStyle:{opacity:0}}
  ];
}

function TemperatureChart({observed,typical,forecastPoints,unit,showForecast,showRange,onVisibleRangeChange}:{observed:Point[];typical:Point[];forecastPoints:Point[];unit:string;showForecast:boolean;showRange:boolean;onVisibleRangeChange?:(start:string,end:string)=>void}){
  const chartRef=useRef<HTMLDivElement|null>(null);
  const rangeCb=useRef(onVisibleRangeChange);
  useEffect(()=>{rangeCb.current=onVisibleRangeChange},[onVisibleRangeChange]);

  useEffect(()=>{
    const el=chartRef.current;
    if(!el)return;
    const c=echarts.init(el);
    const dates=typical.map(x=>x.date);
    const monthStarts=dates.filter(d=>Number(d.slice(8,10))===1);
    const monthLabel=(v:string)=>new Date(v+"T12:00:00").toLocaleString(undefined,{month:"short"});

    const series:any[]=showRange
      ? [
          ...rangeSeries("Typical",typical,"#8293a8","dashed"),
          ...rangeSeries("Observed",observed,"#55b7ff","dashed"),
          ...(showForecast&&forecastPoints.length?rangeSeries("Forecast",forecastPoints,"#ff9d5c","dotted"):[])
        ]
      : [
          {name:"Typical",type:"line",data:typical.map(x=>[x.date,x.value]),smooth:true,showSymbol:false,lineStyle:{type:"dashed",width:2,color:"#8293a8"},itemStyle:{color:"#8293a8"}},
          {name:"Observed",type:"line",data:observed.map(x=>[x.date,x.value]),smooth:.18,showSymbol:false,lineStyle:{width:3,color:"#55b7ff"},itemStyle:{color:"#55b7ff"},areaStyle:{color:"rgba(85,183,255,.08)"}},
          ...(showForecast&&forecastPoints.length?[{name:"Forecast",type:"line",data:forecastPoints.map(x=>[x.date,x.value]),smooth:.18,showSymbol:false,lineStyle:{type:"dotted",width:3,color:"#ff9d5c"},itemStyle:{color:"#ff9d5c"}}]:[])
        ];

    // Vertical month-boundary dividers, attached to the first series (always "Typical"/"Typical min"),
    // so month edges stay visible when zoomed across more than one month. No text label here —
    // the axis already labels every month start; a centered month name is shown instead when
    // zoomed into a single month (see reportRange below).
    if(series[0]){
      series[0]={...series[0],markLine:{
        symbol:"none",
        silent:true,
        animation:false,
        lineStyle:{color:"#3d5673",width:1,type:"solid"},
        label:{show:false},
        data:monthStarts.map(d=>({xAxis:d}))
      }};
    }

    c.setOption({animationDuration:450,tooltip:{trigger:"axis",axisPointer:{type:"line",lineStyle:{color:"rgba(224,235,246,.25)",width:1}},backgroundColor:"rgba(7,18,30,.96)",borderColor:"rgba(194,216,239,.16)",textStyle:{color:"#eaf2f8",fontFamily:"DM Sans",fontSize:11},formatter:(params:any[])=>{
      if(!params.length)return"";
      const dateLabel=new Date(params[0].axisValue+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
      const groups=new Map<string,{min?:number;max?:number;avg?:number}>();
      for(const p of params){
        const v=(p.value as any)?.[1];
        if(v==null)continue;
        const name=p.seriesName as string;
        const mMin=name.match(/^(.*) min$/), mMax=name.match(/^(.*) max$/);
        if(mMin){const g=groups.get(mMin[1])||{};g.min=v;groups.set(mMin[1],g)}
        else if(mMax){const g=groups.get(mMax[1])||{};g.max=v;groups.set(mMax[1],g)}
        else{const g=groups.get(name)||{};g.avg=v;groups.set(name,g)}
      }
      let rows="";
      groups.forEach((g,name)=>{
        const text=g.min!=null&&g.max!=null?`${g.min.toFixed(1)}–${g.max.toFixed(1)}${unit}`:g.avg!=null?`${g.avg.toFixed(1)}${unit}`:null;
        if(text)rows+=`<div style="display:flex;gap:14px;justify-content:space-between;margin-top:4px"><span>${name}</span><b>${text}</b></div>`;
      });
      return `<div style="font-weight:700;margin-bottom:4px">${dateLabel}</div>${rows}`;
    }},grid:{left:8,right:18,top:24,bottom:74,containLabel:true},xAxis:{type:"category",boundaryGap:false,data:dates,axisLabel:{color:"#71859d",interval:(index:number,_value:string)=>Number(dates[index]?.slice(8,10))===1,formatter:(v:string)=>monthLabel(v)},axisLine:{lineStyle:{color:"#26394d"}}},yAxis:{type:"value",min:(v:{min:number})=>Math.min(0,Math.floor(v.min)),axisLabel:{color:"#71859d",formatter:`{value}${unit}`},splitLine:{lineStyle:{color:"rgba(150,170,200,.09)"}}},dataZoom:[{type:"slider",start:0,end:100,height:22,bottom:8,showDetail:false,borderColor:"#26394d",backgroundColor:"#091725",fillerColor:"rgba(85,183,255,.16)",handleStyle:{color:"#55b7ff",borderColor:"#55b7ff"},moveHandleStyle:{color:"#344b63"}},{type:"inside",start:0,end:100}],series});

    // When the visible range sits entirely inside one calendar month, show that month's name
    // centered along the axis — the boundary dividers alone aren't visible unless a month edge
    // happens to be in view, so this covers the "zoomed into the middle of a month" case.
    // The element is always present in the option (never added/removed via $action) and just
    // toggled `invisible` with new text — setting `graphic` to `[]` to hide it does NOT work,
    // since setOption merges the graphic array by index and an empty array has nothing to
    // merge onto index 0, leaving the previous element in place. That was why the caption used
    // to stick around after zooming back out, and why it looked stale after dragging into a
    // different month — the "same object" is reused and its text/visibility updated in place.
    const setMonthCaption=(text:string|null)=>{
      c.setOption({graphic:[{id:"monthCaption",type:"text",invisible:!text,silent:true,left:"center",bottom:56,style:{text:text||"",font:"700 13px \"Space Grotesk\"",fill:"rgba(237,245,255,.55)"}}]});
    };

    const reportRange=(startPct:number,endPct:number)=>{
      if(!dates.length)return;
      const last=dates.length-1;
      const si=Math.max(0,Math.min(last,Math.round((startPct/100)*last)));
      const ei=Math.max(0,Math.min(last,Math.round((endPct/100)*last)));
      const sD=new Date(dates[si]+"T12:00:00"),eD=new Date(dates[ei]+"T12:00:00");
      const sameMonth=sD.getFullYear()===eD.getFullYear()&&sD.getMonth()===eD.getMonth();
      setMonthCaption(sameMonth?sD.toLocaleString(undefined,{month:"long"}):null);
      rangeCb.current?.(dates[si],dates[ei]);
    };
    c.on("dataZoom",()=>{
      const opt:any=c.getOption();
      const dz=opt.dataZoom&&opt.dataZoom[0];
      if(dz)reportRange(dz.start??0,dz.end??100);
    });
    reportRange(0,100);

    const ro=new ResizeObserver(()=>c.resize());
    ro.observe(el);
    return()=>{ro.disconnect();c.dispose()};
  },[observed,typical,forecastPoints,unit,showForecast,showRange]);
  return <div className="chartWrap"><div ref={chartRef} className="chart"/></div>;
}

function Legend({showObserved,showForecast}:{showObserved:boolean;showForecast:boolean}){
  return <div className="legend">{showObserved&&<span><i className="legendLine observedLine"/>Observed</span>}{showForecast&&<span><i className="legendLine forecastLine"/>Forecast</span>}<span><i className="legendLine typicalLine"/>Typical 1991–2020</span></div>
}

function RangeToggle({showRange,setShowRange}:{showRange:boolean;setShowRange:(v:boolean)=>void}){
  return <div className="rangeToggle"><small>RANGE</small><div className="switch"><button type="button" className={!showRange?"active":""} onClick={()=>setShowRange(false)}>Avg</button><button type="button" className={showRange?"active":""} onClick={()=>setShowRange(true)}>Min/Max</button></div></div>
}

function DayCard({d,isToday,selected,onClick,conv}:{d:any;isToday:boolean;selected:boolean;onClick:()=>void;conv:(n:number)=>number}){
 return <button className={`day ${selected?"selected":""}`} onClick={onClick}><small>{new Date(d.date+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"})}{isToday?" (Today)":""}</small><b>{icon(d.code)}</b><strong><small className="hl">H</small>{Math.round(conv(d.max))}°</strong><span><small className="hl">L</small>{Math.round(conv(d.min))}°</span><p>{label(d.code)}</p><small className="dayMeta"><span>💧 {Math.round(d.rain)}%</span> · <span>{Math.round(d.wind)} km/h</span></small></button>
}

// Thermal colour scale used for hourly temperature curves. Anchored to *absolute* real-world
// temperatures (in °C) rather than each day's own min/max — a 15°C peak shouldn't render as
// hot-orange just because it happens to be that day's warmest moment, and a cold day in
// Antarctica shouldn't have its "warmest" (still-freezing) hour rendered in a hot colour just
// because it's relatively less cold than the rest of that day.
//
// Below 0°C the scale continues toward pale icy white (deep freeze reads as "snow", not as a
// darker version of the same blue used just above freezing) rather than reusing the warm end
// of the scale, which is what produced the "red at the coldest point" bug. A single day can
// cross from negative to positive, so this is one continuous function across the whole range,
// not two separate palettes switched on sign.
//
// Stops are deliberately clamped at both ends: anything at or below -25°C renders identically
// to -25°C, and anything at or above 40°C renders identically to 40°C, so a data glitch or an
// unrealistic input (200°C, etc.) can never index outside the palette or produce a broken colour.
const TEMP_COLOR_STOPS_C:[number,string][]=[
  [-25,"#eef4fa"], // deep freeze — icy white
  [-10,"#a9cfe6"], // very cold — pale blue
  [  0,"#4a90c9"], // freezing point — blue
  [ 10,"#4f8f88"], // cool — dim blue-green (not vivid green)
  [ 18,"#d9c15a"], // mild — soft gold
  [ 25,"#e8863f"], // warm — orange
  [ 32,"#e0603f"], // hot — red-orange
  [ 40,"#cf4335"], // very hot (capped) — red leaning orange, not pure saturated red
];
function hexToRgb(hex:string):[number,number,number]{
  const h=hex.replace("#","");
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function mixHex(a:string,b:string,t:number):string{
  const pa=hexToRgb(a),pb=hexToRgb(b);
  return `rgb(${Math.round(pa[0]+(pb[0]-pa[0])*t)},${Math.round(pa[1]+(pb[1]-pa[1])*t)},${Math.round(pa[2]+(pb[2]-pa[2])*t)})`;
}
/** Colour for an absolute Celsius value, clamped at both ends — never throws, never indexes out of range. */
function heatColorForCelsius(celsius:number):string{
  const stops=TEMP_COLOR_STOPS_C;
  if(!Number.isFinite(celsius))return stops[Math.floor(stops.length/2)][1];
  if(celsius<=stops[0][0])return stops[0][1];
  if(celsius>=stops[stops.length-1][0])return stops[stops.length-1][1];
  for(let i=0;i<stops.length-1;i++){
    const[t0,c0]=stops[i],[t1,c1]=stops[i+1];
    if(celsius>=t0&&celsius<=t1)return mixHex(c0,c1,(celsius-t0)/((t1-t0)||1));
  }
  return stops[stops.length-1][1];
}
/** Reverse the display-unit conversion so thresholds always evaluate in real Celsius terms,
 * regardless of whether the UI is currently showing °C or °F. */
function toCelsiusFrom(unit:string,v:number):number{return unit==="°F"?(v-32)*5/9:v}
function fromCelsiusTo(unit:string,c:number):number{return unit==="°F"?c*9/5+32:c}
/** Pre-samples the absolute scale at N evenly-spaced points across a fixed display-unit range,
 * so it can be fed to echarts' visualMap (which linearly interpolates between evenly-spaced
 * colour stops) while the actual colour *values* still follow our non-uniform, absolute-Celsius
 * curve — e.g. the whole 10–18°C "mild" band stays visually muted rather than being stretched
 * across whatever fraction of the day's own range it happens to occupy. */
function buildHeatPalette(unit:string,steps=48):{colors:string[];min:number;max:number}{
  const min=fromCelsiusTo(unit,TEMP_COLOR_STOPS_C[0][0]);
  const max=fromCelsiusTo(unit,TEMP_COLOR_STOPS_C[TEMP_COLOR_STOPS_C.length-1][0]);
  const colors:string[]=[];
  for(let i=0;i<=steps;i++){
    const displayValue=min+(max-min)*(i/steps);
    colors.push(heatColorForCelsius(toCelsiusFrom(unit,displayValue)));
  }
  return {colors,min,max};
}

/** Hour-by-hour temperature chart. */
function HourlyChart({hours,unit,timezone,selectedDate,mode}:{hours:{time:string;temp:number;feels:number;code?:number;isDay?:boolean}[];unit:string;timezone:string;selectedDate:string;mode:"actual"|"feels"}){
  const chartRef=useRef<HTMLDivElement|null>(null);
  const[clock,setClock]=useState(0);
  useEffect(()=>{setClock(Date.now());const id=window.setInterval(()=>setClock(Date.now()),60_000);return()=>window.clearInterval(id)},[selectedDate,timezone]);
  useEffect(()=>{
    const el=chartRef.current;if(!el||!hours.length)return;
    const c=echarts.init(el);
    const GL=46,GR=14,GT=34,GB=32; // grid pixel margins — kept in sync with the `grid` option below
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(clock||Date.now()));
    const part=(t:string)=>parts.find(x=>x.type===t)?.value||"";
    const today=localToday(timezone), nowDate=`${part("year")}-${part("month")}-${part("day")}`, nowHour=part("hour");
    const isToday=selectedDate===today&&nowDate===today;

    // The chart is supersampled to one point every 5 minutes (289 points across the day),
    // linearly interpolated between the real hourly samples. This is what makes hovering feel
    // continuous rather than snapping between 25 discrete hourly ticks — echarts' axis-trigger
    // tooltip always resolves to *some* real data point, so the fix is having enough of them,
    // not writing a custom hit-test. It's also what lets the past/future curve split (below)
    // land within ~2.5 minutes of the real current time instead of snapping to the nearest
    // whole hour.
    const STEP_MIN=5,TOTAL_MIN=24*60,STEPS_PER_HOUR=60/STEP_MIN;
    const denseTimes:string[]=[],denseTemp:number[]=[],denseFeels:number[]=[],denseHourIdx:number[]=[];
    for(let m=0;m<=TOTAL_MIN;m+=STEP_MIN){
      const hourIdx=Math.min(Math.floor(m/60),hours.length-1);
      const frac=(m%60)/60;
      const h0=hours[hourIdx],h1=hours[Math.min(hourIdx+1,hours.length-1)];
      denseTemp.push(h0.temp+(h1.temp-h0.temp)*frac);
      denseFeels.push(h0.feels+(h1.feels-h0.feels)*frac);
      denseHourIdx.push(Math.min(Math.round(m/60),hours.length-1));
      const hh=String(Math.floor(m/60)%24).padStart(2,"0"),mm=String(m%60).padStart(2,"0");
      denseTimes.push(`${hours[hourIdx].time.slice(0,10)}T${hh}:${mm}`);
    }
    const dates=denseTimes, values=mode==="actual"?denseTemp:denseFeels;

    // Exact fractional position (in dense-grid units) for the live-time marker — purely a pixel
    // calculation (see paintNow below), so it's precise to the minute regardless of the grid's
    // own 5-minute resolution.
    const nowMinutes=isToday?Number(nowHour)*60+Number(part("minute")):null;
    const fracIndex=nowMinutes!=null?nowMinutes/STEP_MIN:null;
    const currentIndex=fracIndex!=null?Math.round(fracIndex):-1;
    const hasCurrent=currentIndex>=0;

    const lowIndex=values.indexOf(Math.min(...values)), highIndex=values.indexOf(Math.max(...values));
    const width=el.clientWidth, labelStep=width>=700?1:width>=500?2:4;
    // Ticks/labels only ever land on whole hours (every STEPS_PER_HOUR-th dense point) — the
    // 5-minute points in between are for hover/curve precision only, never shown on the axis.
    const axis={type:"category",boundaryGap:false,data:dates,axisTick:{interval:(idx:number)=>idx%STEPS_PER_HOUR===0,length:4,lineStyle:{color:"#52687e"}},axisLabel:{color:"#8ea0b3",interval:(idx:number)=>idx%STEPS_PER_HOUR!==0?false:(idx/STEPS_PER_HOUR)%labelStep===0||idx===dates.length-1,fontSize:10,hideOverlap:true,formatter:(v:string)=>hourLabel(v)},axisLine:{lineStyle:{color:"#31465c"}}};
    // Thermal colour scale: anchored to absolute real-world temperature (see heatColorForCelsius),
    // not the currently visible range — so a mild day and a scorching day are never rendered
    // with the same intensity of "hot" colour just because each is relatively its own peak.
    const lowColor=heatColorForCelsius(toCelsiusFrom(unit,values[lowIndex]));
    const highColor=heatColorForCelsius(toCelsiusFrom(unit,values[highIndex]));
    const heatPalette=buildHeatPalette(unit);
    // IMPORTANT: markPoint must NOT live on a series that visualMap targets (below). visualMap
    // recolors every element attached to its target series, including markers, and those don't
    // carry the plain [x,y] values it expects — that combination is what crashed the renderer
    // in earlier builds. So the L/H badges get their own separate, invisible line series (same
    // data, just for anchoring), kept entirely out of heatSeriesIndex. The live-time marker
    // itself is drawn separately below as a plain `graphic` line rather than `markLine` — it
    // doesn't need a series at all, and this sidesteps the whole marker/visualMap interaction.
    // areaStyle deliberately has no explicit `color` — it inherits the same per-segment colour
    // visualMap is already painting the line with, so the fill and the stroke always match.
    // `base` and `past` split the day at "now" and never overlap (`base` only carries the
    // future/current half, `past` only the elapsed half, joined by sharing the boundary point)
    // — this is what makes it read as one continuous curve that's dashed then solid, rather
    // than a separate dashed line drawn on top of a solid one underneath.
    const denseIdx=denseTimes.map((_,i)=>i);
    const base={name:mode==="actual"?"Actual":"Feels like",type:"line",data:denseIdx.map(i=>hasCurrent&&i<currentIndex?[dates[i],null]:[dates[i],values[i]]),connectNulls:false,smooth:.22,showSymbol:false,lineStyle:{width:3},itemStyle:{},areaStyle:mode==="actual"?{opacity:.55}:{opacity:0},z:1};
    // Past hours use a longer, round-capped dash (reads as a row of little pills rather than
    // rectangular tick marks) — iOS Weather treats elapsed hours as mostly irrelevant. The
    // divider is exactly "now" (see the graphic rectangle+line below), positioned to the exact
    // minute rather than snapped to the hour.
    const past=hasCurrent?{name:"__pastCurve",type:"line",data:denseIdx.map(i=>i<=currentIndex?[dates[i],values[i]]:[dates[i],null]),connectNulls:false,smooth:.22,showSymbol:false,lineStyle:{width:3,type:[11,5],cap:"round"},itemStyle:{opacity:0},areaStyle:mode==="actual"?{opacity:.55}:{opacity:0},z:1}:null;
    // In the Feels-like view, overlay the plain Actual temperature as a thin flat grey
    // reference line (no fill, no per-segment heat colour, not part of visualMap) so the two
    // can be compared directly — same idea as iOS Weather's Feels Like screen.
    const actualRef=mode==="feels"?{name:"__actualRef",type:"line",data:denseIdx.map(i=>[dates[i],denseTemp[i]]),smooth:.22,showSymbol:false,silent:true,lineStyle:{width:2,color:"rgba(180,190,201,.55)"},itemStyle:{opacity:0},areaStyle:{opacity:0},z:0}:null;
    // H/L badges — present in both Actual and Feels-like views.
    const markers={name:"__markers",type:"line",data:denseIdx.map(i=>[dates[i],values[i]]),showSymbol:false,silent:true,lineStyle:{opacity:0},itemStyle:{opacity:0},areaStyle:{opacity:0},tooltip:{show:false},z:5,markPoint:{symbol:"circle",symbolSize:6,silent:true,label:{show:true,fontFamily:"Space Grotesk",fontSize:12,fontWeight:700,formatter:(p:any)=>p.data.name},data:[{name:"L",coord:[dates[lowIndex],values[lowIndex]],itemStyle:{color:lowColor,borderColor:"#071624",borderWidth:2},label:{position:"top",offset:[0,-4],color:lowColor}},{name:"H",coord:[dates[highIndex],values[highIndex]],itemStyle:{color:highColor,borderColor:"#071624",borderWidth:2},label:{position:"top",offset:[0,-4],color:highColor}}]}};
    const seriesArr:any[]=[base];
    const heatSeriesIndex=[0];
    if(past){seriesArr.push(past);heatSeriesIndex.push(seriesArr.length-1);}
    if(actualRef)seriesArr.push(actualRef);
    seriesArr.push(markers);
    c.setOption({animationDuration:300,visualMap:{show:false,type:"continuous",dimension:1,seriesIndex:heatSeriesIndex,min:heatPalette.min,max:heatPalette.max,inRange:{color:heatPalette.colors}},tooltip:{show:true,trigger:"axis",axisPointer:{type:"line",lineStyle:{color:"rgba(224,235,246,.28)",width:1}},backgroundColor:"rgba(7,18,30,.96)",borderColor:"rgba(194,216,239,.16)",textStyle:{color:"#eaf2f8",fontFamily:"DM Sans",fontSize:11},formatter:(params:any[])=>{
      const row=params.find(p=>p.seriesName!=="__markers"&&p.seriesName!=="__actualRef"&&p.value?.[1]!=null);
      if(!row)return"";
      const value=(row.value as any)[1] as number;
      const hourIdx=denseHourIdx[row.dataIndex]??0;
      const src=hours[hourIdx];
      const emoji=src?.code!=null?icon(src.code,src.isDay):"";
      const refRow=mode==="feels"?params.find(pp=>pp.seriesName==="__actualRef"):null;
      const refLine=refRow&&refRow.value?.[1]!=null?`<div style="color:#9aa6b8;font-size:12px;margin-top:2px">Actual: ${Math.round((refRow.value as any)[1])}${unit}</div>`:"";
      return `<div style="font-weight:700;margin-bottom:6px">${preciseTimeLabel(row.axisValue)}</div><div style="font-size:15px;font-weight:700">${emoji}${Math.round(value)}${unit}</div>${refLine}`;
    }},grid:{left:GL,right:GR,top:GT,bottom:GB,containLabel:false},xAxis:axis,yAxis:{type:"value",min:(v:{min:number})=>Math.min(0,Math.floor(v.min)),minInterval:1,axisLabel:{color:"#8ea0b3",fontSize:10,formatter:(v:number)=>`${Math.round(v)}${unit}`},splitLine:{lineStyle:{color:"rgba(150,170,200,.10)"}}},series:seriesArr});

    // Live-time marker: a dark gradient veil covering everything left of "now" — darkest at the
    // start of the day (longest elapsed, least relevant) fading toward "now" (still recent) —
    // plus a thin dashed divider line, both hand-positioned from the exact hour+minute fraction
    // (boundaryGap:false category axis ⇒ evenly-spaced points, so this is simple linear
    // interpolation) rather than snapped to a data point. The gradient uses explicit pixel
    // coordinates (globalCoord) spanning the *actual* dimmed region (GL → x) — not the whole
    // canvas and not just a sliver at "now" — so it always fades across the full elapsed portion
    // of the graph, however much or little of the day has passed. Both graphic elements are
    // always present in the option (never added/removed via $action), just toggled `invisible`
    // — that avoids a separate class of echarts crash where removing a graphic element that was
    // never created throws internally. z sits above the markers so the dimming reads as "on top
    // of" the whole chart, while staying non-interactive (`silent`) so it never blocks hover.
    const paintNow=()=>{
      const w=el.clientWidth-GL-GR, h=el.clientHeight;
      const x=fracIndex==null?GL:GL+(fracIndex/(dates.length-1))*w;
      const y1=GT,y2=Math.max(GT,h-GB);
      const veil=x>GL?new echarts.graphic.LinearGradient(GL,0,x,0,[{offset:0,color:"rgba(1,7,13,.62)"},{offset:1,color:"rgba(1,7,13,.22)"}],true):"rgba(1,7,13,0)";
      c.setOption({graphic:[
        {id:"pastRect",type:"rect",invisible:fracIndex==null,silent:true,z:40,shape:{x:GL,y:y1,width:Math.max(0,x-GL),height:y2-y1},style:{fill:veil}},
        {id:"nowLine",type:"line",invisible:fracIndex==null,silent:true,z:50,shape:{x1:x,y1,x2:x,y2},style:{stroke:"rgba(232,239,246,.85)",lineWidth:1.2,lineDash:[3,3]}}
      ]});
    };
    paintNow();

    const ro=new ResizeObserver(()=>{c.resize();paintNow()});ro.observe(el);return()=>{ro.disconnect();c.dispose()};
  },[hours,unit,timezone,selectedDate,clock,mode]);
  return <div className="hourlyChart" ref={chartRef}/>;
}

/** Probability chart with weather-type-aware labels and a live current-hour divider. */
function PrecipitationChart({hours,timezone,selectedDate}:{hours:{time:string;rain:number;code:number}[];timezone:string;selectedDate:string}){
  const chartRef=useRef<HTMLDivElement|null>(null);const[clock,setClock]=useState(0);
  useEffect(()=>{setClock(Date.now());const id=window.setInterval(()=>setClock(Date.now()),60_000);return()=>window.clearInterval(id)},[selectedDate,timezone]);
  useEffect(()=>{const el=chartRef.current;if(!el||!hours.length)return;const c=echarts.init(el);
    const GL=46,GR=14,GT=18,GB=32;
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(clock||Date.now()));const part=(t:string)=>parts.find(x=>x.type===t)?.value||"";
    const today=localToday(timezone),nowDate=`${part("year")}-${part("month")}-${part("day")}`,isToday=selectedDate===today&&nowDate===today;
    const nowHour=part("hour");
    const fracIndex=isToday?Number(nowHour)+Number(part("minute"))/60:null;
    const dates=hours.map(h=>h.time),width=el.clientWidth,labelStep=width>=700?1:width>=500?2:4;
    const line={name:"Chance of precipitation",type:"line",data:hours.map(h=>[h.time,h.rain]),smooth:.2,connectNulls:true,showSymbol:false,lineStyle:{width:3,color:"#63b8ff"},itemStyle:{color:"#63b8ff"},areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:"rgba(99,184,255,.30)"},{offset:.6,color:"rgba(99,184,255,.10)"},{offset:1,color:"rgba(255,102,76,0)"}])},z:3};
    c.setOption({animationDuration:300,tooltip:{show:true,trigger:"axis",axisPointer:{type:"line",lineStyle:{color:"rgba(224,235,246,.28)"}},backgroundColor:"rgba(7,18,30,.96)",borderColor:"rgba(194,216,239,.16)",textStyle:{color:"#eaf2f8",fontFamily:"DM Sans",fontSize:11},formatter:(params:any[])=>{const row=params.find(p=>p.seriesName==="Chance of precipitation");if(!row)return"";return `<div style="font-weight:700;margin-bottom:6px">${hourLabel(row.axisValue)}</div><b>${Math.round(row.value[1])}%</b>`;}},grid:{left:GL,right:GR,top:GT,bottom:GB,containLabel:false},xAxis:{type:"category",boundaryGap:false,data:dates,axisTick:{interval:0},axisLabel:{color:"#8ea0b3",interval:(idx:number)=>idx%labelStep===0||idx===dates.length-1,fontSize:10,hideOverlap:true,formatter:(v:string)=>hourLabel(v)},axisLine:{lineStyle:{color:"#31465c"}}},yAxis:{type:"value",min:0,max:100,interval:25,axisLabel:{color:"#8ea0b3",fontSize:10,formatter:"{value}%"},splitLine:{lineStyle:{color:"rgba(150,170,200,.10)"}}},series:[line]});

    // Flat dark rectangle over the past region (not a fade — see HourlyChart for the same
    // treatment/reasoning), positioned at the exact hour+minute fraction.
    const paintNow=()=>{
      const w=el.clientWidth-GL-GR, h=el.clientHeight;
      const x=fracIndex==null?GL:GL+(fracIndex/(dates.length-1))*w;
      const y1=GT,y2=Math.max(GT,h-GB);
      c.setOption({graphic:[
        {id:"pastRect",type:"rect",invisible:fracIndex==null,silent:true,z:40,shape:{x:GL,y:y1,width:Math.max(0,x-GL),height:y2-y1},style:{fill:"rgba(1,7,13,.5)"}},
        {id:"nowLine",type:"line",invisible:fracIndex==null,silent:true,z:50,shape:{x1:x,y1,x2:x,y2},style:{stroke:"rgba(232,239,246,.85)",lineWidth:1.2,lineDash:[3,3]}}
      ]});
    };
    paintNow();

    const ro=new ResizeObserver(()=>{c.resize();paintNow()});ro.observe(el);return()=>{ro.disconnect();c.dispose()};
  },[hours,timezone,selectedDate,clock]);
  return <div className="precipChart" ref={chartRef}/>;
}

function precipColor(p:number):string{
  if(p<10)return"#5c7280";
  if(p<40)return"#6fb3e0";
  if(p<70)return"#3d92c9";
  return"#1f7ab0";
}
function feelsBg(celsius:number):string{
  if(celsius<=0)return"rgba(90,169,214,.32)";
  if(celsius<=10)return"rgba(120,180,220,.22)";
  if(celsius<=18)return"rgba(255,214,140,.22)";
  if(celsius<=24)return"rgba(255,184,100,.38)";
  if(celsius<=30)return"rgba(255,146,74,.52)";
  return"rgba(255,104,56,.65)";
}

function hour24(s:string){return `${String(Number(s.slice(11,13))).padStart(2,"0")}:00`}

const WEATHER_ADJ:Record<string,string>={Clear:"clear",Cloudy:"cloudy",Fog:"foggy",Drizzle:"drizzly",Rain:"rainy",Snow:"snowy",Thunderstorm:"stormy",Mixed:"mixed"};

/** Generates a short plain-language summary of a day from its hourly data, e.g.
 * "Warm and clear today. Temperatures peak around 27°C at 16:00, with a chance of rain after 18:00." */
function daySummary(dayHours:{time:string;temp:number;rain:number}[],code:number,conv:(n:number)=>number,unit:string):string{
  if(!dayHours.length)return"";
  const avgTemp=dayHours.reduce((a,h)=>a+h.temp,0)/dayHours.length;
  const descriptor=avgTemp<5?"Cold":avgTemp<14?"Cool":avgTemp<22?"Mild":avgTemp<29?"Warm":"Hot";
  const peak=dayHours.reduce((best,h)=>h.temp>best.temp?h:best,dayHours[0]);
  const avgRain=dayHours.reduce((a,h)=>a+h.rain,0)/dayHours.length;
  const maxRain=Math.max(...dayHours.map(h=>h.rain));
  let rainClause:string;
  if(avgRain>=50)rainClause="with rain likely through the day";
  else if(maxRain<15)rainClause="staying dry throughout";
  else{
    const idx=dayHours.findIndex(h=>h.rain>=40);
    rainClause=idx>=0?`with a chance of rain after ${hour24(dayHours[idx].time)}`:"with a small chance of rain";
  }
  const adj=WEATHER_ADJ[label(code)]??label(code).toLowerCase();
  return `${descriptor} and ${adj} today. Temperatures peak around ${Math.round(conv(peak.temp))}${unit} at ${hour24(peak.time)}, ${rainClause}.`;
}

function hm(s:string){return s.slice(11,16)}

/** Average temperature across the hours between sunrise and sunset, if both are known.
 * Compares full local timestamps (not just the hour digits) so it isn't thrown off by
 * minute offsets — e.g. a 6:47 sunrise previously matched against whole-hour buckets could
 * miss the 6:00 or 7:00 slot depending on rounding. */
function daytimeAverage(hours:{time:string;temp:number}[],sunrise?:string,sunset?:string):number|null{
  if(!sunrise||!sunset)return null;
  const sunriseMs=Date.parse(sunrise),sunsetMs=Date.parse(sunset);
  if(Number.isNaN(sunriseMs)||Number.isNaN(sunsetMs))return null;
  const daytime=hours.slice(0,24).filter(h=>{const t=Date.parse(h.time);return Number.isFinite(t)&&t>=sunriseMs&&t<sunsetMs});
  if(!daytime.length)return null;
  return daytime.reduce((a,h)=>a+h.temp,0)/daytime.length;
}


function HourlyModeToggle({mode,setMode}:{mode:"actual"|"feels";setMode:(v:"actual"|"feels")=>void}){
 return <div className="hourlyModeToggle"><small>VIEW</small><div className="switch"><button type="button" className={mode==="actual"?"active":""} onClick={()=>setMode("actual")}>Actual</button><button type="button" className={mode==="feels"?"active":""} onClick={()=>setMode("feels")}>Feels like</button></div></div>
}
function HourlyDetails({day,hours,sunrise,sunset,timezone,cityName,unit,conv}:{day:any;hours:{time:string;temp:number;feels:number;rain:number;wind:number;code:number;isDay?:boolean}[];sunrise?:string;sunset?:string;timezone:string;cityName:string;unit:string;conv:(n:number)=>number}){
 const dayHours=hours.slice(0,24);
 const temps=dayHours.map(h=>h.temp);
 const minIdx=temps.length?temps.indexOf(Math.min(...temps)):-1;
 const maxIdx=temps.length?temps.indexOf(Math.max(...temps)):-1;
 const daytimeAvg=daytimeAverage(hours,sunrise,sunset);
 const[hourlyMode,setHourlyMode]=useState<"actual"|"feels">("actual");
 const[nowTick,setNowTick]=useState(Date.now());
 useEffect(()=>{const id=window.setInterval(()=>setNowTick(Date.now()),60_000);return()=>window.clearInterval(id)},[timezone,day.date]);
 const currentHourKey=(()=>{const p=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(nowTick));const g=(t:string)=>p.find(x=>x.type===t)?.value||"";const d=`${g("year")}-${g("month")}-${g("day")}`;return d===day.date?`${d}T${g("hour")}:00`:null;})();
 return <div className="hourlyPanel"><div className="hourlyHead"><div><label>HOURLY DETAIL</label><h3>{fmtWeekdayDate(day.date)}</h3></div><span>{cityName} · local time ({timezone})</span></div>
 {(sunrise||sunset||daytimeAvg!=null)&&<div className="dayFacts">
   {sunrise&&<span>☀️ Sunrise {hm(sunrise)}</span>}
   {sunset&&<span>🌇 Sunset {hm(sunset)}</span>}
   {daytimeAvg!=null&&<span>🌡️ Daytime avg {Math.round(conv(daytimeAvg))}{unit}</span>}
 </div>}
 <div className="chartSection"><div className="miniChartHead"><div><label>TEMPERATURE</label><span>{hourlyMode==="actual"?"Actual temperature with high / low markers":"Apparent temperature"}</span></div><HourlyModeToggle mode={hourlyMode} setMode={setHourlyMode}/></div><HourlyChart hours={hours.map(h=>({time:h.time,temp:conv(h.temp),feels:conv(h.feels),code:h.code,isDay:h.isDay}))} unit={unit} timezone={timezone} selectedDate={day.date} mode={hourlyMode}/></div>
 <div className="chartSection precipSection"><div className="miniChartHead"><div><label>PRECIPITATION</label><span>Probability adapts to rain, snow and storm / hail risk</span></div></div><PrecipitationChart hours={hours.map(h=>({time:h.time,rain:h.rain,code:h.code}))} timezone={timezone} selectedDate={day.date}/></div>
 <div className="hourlyTableOuter">
   <div className="hourlyLabels">
     <div className="hlabel hlabel-hour">Hour</div>
     <div className="hlabel hlabel-icon">Sky</div>
     <div className="hlabel hlabel-precip">Rain chance</div>
     <div className="hlabel hlabel-temp">Temp</div>
     <div className="hlabel hlabel-feels">Feels like</div>
     <div className="hlabel hlabel-wind">Wind (km/h)</div>
   </div>
   <div className="hourlyTableWrap"><div className="hourlyTable">{hours.map((h,idx)=><div className={`hcol${h.time===currentHourKey?" is-current": ""}`} key={h.time}>
     <div className="hcol-hour">{idx===24?"24H":`${Number(h.time.slice(11,13))}H`}</div>
     <div className="hcol-icon">{icon(h.code,h.isDay)}</div>
     <div className="hcol-precip" style={{color:precipColor(h.rain)}}>{Math.round(h.rain)}%</div>
     <div className={`hcol-temp${idx===minIdx?" is-min":""}${idx===maxIdx?" is-max":""}`}>{Math.round(conv(h.temp))}°</div>
     <div className="hcol-feels" style={{background:feelsBg(h.feels)}}>{Math.round(conv(h.feels))}°</div>
     <div className="hcol-wind">{Math.round(h.wind)}</div>
   </div>)}</div></div>
 </div></div>
}

/** Human-readable label for the chart's currently zoomed date range, shown above the year stats. */
function rangeSummaryLabel(range:{start:string;end:string}|null,year:number):string{
  if(!range)return`${year} · full year`;
  const s=new Date(range.start+"T12:00:00"),e=new Date(range.end+"T12:00:00");
  const isFullYear=s.getMonth()===0&&s.getDate()===1&&e.getMonth()===11&&e.getDate()>=30;
  if(isFullYear)return`${year} · full year`;
  const opt:Intl.DateTimeFormatOptions={month:"short",day:"numeric"};
  return`${s.toLocaleDateString(undefined,opt)} – ${e.toLocaleDateString(undefined,opt)}, ${year}`;
}

function App(){
 const[loc,setLoc]=useState<Location>(()=>{try{return JSON.parse(localStorage.getItem("wa-loc")||"")}catch{return fallback}});
 const[y,setY]=useState(yearNow),[unit,setUnit]=useState("°C"),[showRange,setShowRange]=useState(false),[data,setData]=useState<WeatherResponse|null>(null),[hist,setHist]=useState<WeatherResponse|null>(null),[base,setBase]=useState<WeatherResponse|null>(null),[err,setErr]=useState(""),[loadingLoc,setLoadingLoc]=useState(true),[loadingYear,setLoadingYear]=useState(true),[selectedDay,setSelectedDay]=useState(0),[visibleRange,setVisibleRange]=useState<{start:string;end:string}|null>(null);
 const loading=loadingLoc||loadingYear;
 useEffect(()=>localStorage.setItem("wa-loc",JSON.stringify(loc)),[loc]);

 // Location-only data: forecast (next ~16 days) and the 1991–2020 baseline. Neither depends on
 // the selected year, so this only refetches when the city actually changes — previously this
 // (plus the year effect below) all refired together on every year click, which was the main
 // driver of hitting Open-Meteo's rate limit.
 useEffect(()=>{
   const controller=new AbortController();
   let gone=false;
   setLoadingLoc(true);
   setSelectedDay(0);
   (async()=>{
     try{
       const[f,b]=await Promise.all([forecast(loc,controller.signal),baseline(loc,controller.signal)]);
       if(!gone){setData(f);setBase(b)}
     }catch(e){
       if(!gone&&!isAbortError(e))setErr(e instanceof Error?e.message:"Unable to load weather");
     }finally{
       if(!gone)setLoadingLoc(false);
     }
   })();
   return()=>{gone=true;controller.abort()};
 },[loc]);

 // Year-dependent data: the observed/archive record for whichever year is selected.
 useEffect(()=>{
   const controller=new AbortController();
   let gone=false;
   setLoadingYear(true);
   (async()=>{
     try{
       const today=localToday(loc.timezone);
       const h=await archive(loc,y,y===yearNow?daysBefore(today,2):undefined,controller.signal);
       if(!gone)setHist(h);
     }catch(e){
       if(!gone&&!isAbortError(e))setErr(e instanceof Error?e.message:"Unable to load weather");
     }finally{
       if(!gone)setLoadingYear(false);
     }
   })();
   return()=>{gone=true;controller.abort()};
 },[loc,y]);

 const conv=(n:number)=>unit==="°C"?n:n*9/5+32;
 const obs=useMemo<Point[]>(()=>hist?.daily.time.map((date,i)=>({date,value:conv(hist.daily.temperature_2m_mean?.[i]??NaN),min:hist.daily.temperature_2m_min?.[i]!=null?conv(hist.daily.temperature_2m_min[i]):undefined,max:hist.daily.temperature_2m_max?.[i]!=null?conv(hist.daily.temperature_2m_max[i]):undefined})).filter(x=>Number.isFinite(x.value))??[],[hist,unit]);
 const typical=useMemo<Point[]>(()=>{if(!base)return[];const meanBins:number[][]=Array.from({length:366},()=>[]),minBins:number[][]=Array.from({length:366},()=>[]),maxBins:number[][]=Array.from({length:366},()=>[]);base.daily.time.forEach((s,i)=>{const d=new Date(s+"T12:00:00");const n=Math.min(Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,1))/86400000),365);const mv=base.daily.temperature_2m_mean?.[i],mnv=base.daily.temperature_2m_min?.[i],mxv=base.daily.temperature_2m_max?.[i];if(mv!=null)meanBins[n].push(mv);if(mnv!=null)minBins[n].push(mnv);if(mxv!=null)maxBins[n].push(mxv)});const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;const out:Point[]=[];const d=new Date(y,0,1);while(d.getFullYear()===y){const n=Math.min(Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,1))/86400000),365);out.push({date:d.toISOString().slice(0,10),value:conv(avg(meanBins[n])),min:minBins[n].length?conv(avg(minBins[n])):undefined,max:maxBins[n].length?conv(avg(maxBins[n])):undefined});d.setDate(d.getDate()+1)}return out},[base,y,unit]);
 const future=useMemo<Point[]>(()=>{if(!data||y!==yearNow)return[];const today=localToday(loc.timezone);return data.daily.time.map((date,i)=>({date,value:conv(data.daily.temperature_2m_mean?.[i]??NaN),min:data.daily.temperature_2m_min?.[i]!=null?conv(data.daily.temperature_2m_min[i]):undefined,max:data.daily.temperature_2m_max?.[i]!=null?conv(data.daily.temperature_2m_max[i]):undefined})).filter(x=>x.date>=today&&Number.isFinite(x.value))},[data,y,unit,loc.timezone]);
 const showObserved=obs.length>0,showForecast=y===yearNow&&future.length>0;
 const visibleObs=useMemo(()=>visibleRange?obs.filter(p=>p.date>=visibleRange.start&&p.date<=visibleRange.end):obs,[obs,visibleRange]);
 const visibleMins=visibleObs.map(x=>x.min).filter((v):v is number=>v!=null);
 const visibleMaxs=visibleObs.map(x=>x.max).filter((v):v is number=>v!=null);
 const noteText=y>yearNow?"Future years show the historical seasonal baseline only; exact long-range daily weather cannot be predicted reliably.":y===yearNow?"Observed temperatures run through today. The forecast line covers roughly the next two weeks, which is as far ahead as daily weather can be predicted with useful accuracy.":"";
 const days=data?.daily.time.slice(0,7).map((date,i)=>({date,i,min:data.daily.temperature_2m_min?.[i]??0,max:data.daily.temperature_2m_max?.[i]??0,rain:data.daily.precipitation_probability_max?.[i]??0,wind:data.daily.wind_speed_10m_max?.[i]??0,humidity:data.daily.relative_humidity_2m_mean?.[i]??0,uv:data.daily.uv_index_max?.[i]??0,code:data.daily.weather_code?.[i]??0}))??[];
 // The forecast API always returns today-first (e.g. Tue…Mon). The day picker instead always
 // reads Monday→Sunday, regardless of which weekday "today" falls on — `i` (the original,
 // chronological index into `days`/`data.daily.*`) rides along so selection still points at
 // the right underlying date after reordering.
 const mondayFirst=(date:string)=>(new Date(date+"T12:00:00").getDay()+6)%7;
 const orderedDays=[...days].sort((a,b)=>mondayFirst(a.date)-mondayFirst(b.date));
 const today=localToday(loc.timezone);
 const selected=days[selectedDay];
 // 25 points, not 24: the 25th is midnight of the next day, so the chart/table visibly reach
 // the end of the day instead of stopping at 11 PM. Computed once here and reused by the chart,
 // the table, and the generated summary sentence below.
 const selectedHours=useMemo(()=>{
   if(!data||!selected)return[];
   const start=data.hourly.time.findIndex(x=>x.startsWith(selected.date));
   if(start<0)return[];
   return Array.from({length:25},(_,j)=>{const i=start+j;return{time:data.hourly.time[i],temp:data.hourly.temperature_2m?.[i]??0,feels:data.hourly.apparent_temperature?.[i]??0,rain:data.hourly.precipitation_probability?.[i]??0,wind:data.hourly.wind_speed_10m?.[i]??0,code:data.hourly.weather_code?.[i]??0,isDay:data.hourly.is_day?.[i]==null?undefined:data.hourly.is_day[i]===1}}).filter(h=>h.time);
 },[data,selected]);
 const daySummaryText=selected&&selectedHours.length?daySummary(selectedHours.slice(0,24),selected.code,conv,unit):"";
 const selectedSunrise=data?.daily.sunrise?.[selectedDay];
 const selectedSunset=data?.daily.sunset?.[selectedDay];
 return <><header><div className="brand"><span><CloudSun size={21}/></span><b>Weather Dashboard</b><small>weather · climate · context</small></div><div className="controls"><LocationPicker loc={loc} setLoc={setLoc}/><select value={unit} onChange={e=>setUnit(e.target.value)}><option>°C</option><option>°F</option></select></div></header>
 <main><div className="hero"><div><h1>{loc.name}<em>, {loc.country}</em></h1></div><aside><small>LOCAL DATE</small><b>{fmt(today,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</b></aside></div>
 {err&&<div className="error">{err}</div>}
 <section><div className="head"><div className="forecastHead"><label>7-DAY FORECAST</label><h2>{daySummaryText||"Select a day to open the full 24-hour forecast."}</h2></div></div><div className="days">{orderedDays.map(d=><DayCard key={d.date} d={d} isToday={d.date===today} selected={d.i===selectedDay} onClick={()=>setSelectedDay(d.i)} conv={conv}/>)}</div>{selected&&data&&<HourlyDetails day={selected} hours={selectedHours} sunrise={selectedSunrise} sunset={selectedSunset} timezone={data.timezone} cityName={loc.name} unit={unit} conv={conv}/>}</section>
 <section><div className="head"><div><label>ANNUAL TEMPERATURE</label><h2>Temperature through the year</h2><p>Compare observed temperatures with the seasonal baseline and near-term forecast.</p></div><div className="headControls"><RangeToggle showRange={showRange} setShowRange={setShowRange}/><div className="year"><small>YEAR</small><div className="yearRow"><select value={y} onChange={e=>setY(+e.target.value)}>{Array.from({length:41},(_,i)=>yearNow-20+i).map(n=><option key={n}>{n}</option>)}</select><button aria-label="Reset to current year" onClick={()=>setY(yearNow)}><RefreshCw size={15}/></button></div></div></div></div>
 <Legend showObserved={showObserved} showForecast={showForecast}/>{loading?<div className="loading">Loading weather data…</div>:<TemperatureChart observed={obs} typical={typical} forecastPoints={future} unit={unit} showForecast={showForecast} showRange={showRange} onVisibleRangeChange={(start,end)=>setVisibleRange(prev=>(prev&&prev.start===start&&prev.end===end)?prev:{start,end})}/>}
 <div className="zoomGuide"><div><b>Focus the chart</b><span>Use the handles below to choose a date range, or scroll inside the chart to zoom.</span></div><span className="rangeHint">◀ drag handles · ▶ drag range</span></div>
 {noteText&&<div className="note">{noteText}</div>}
 <div className="statsBlock"><div className="statsHead"><label>YEAR SUMMARY</label><span>{rangeSummaryLabel(visibleRange,y)}</span></div><div className="stats"><Stat icon={<ThermometerSnowflake/>} title="Coldest" value={visibleMins.length?Math.min(...visibleMins).toFixed(1)+unit:"—"}/><Stat icon={<Thermometer/>} title="Average" value={visibleObs.length?(visibleObs.reduce((a,b)=>a+b.value,0)/visibleObs.length).toFixed(1)+unit:"—"}/><Stat icon={<Sun/>} title="Warmest" value={visibleMaxs.length?Math.max(...visibleMaxs).toFixed(1)+unit:"—"}/></div></div>
 </section>
 <footer>Open-Meteo weather data · historical data uses reanalysis</footer></main></>
}
function Stat({icon,title,value}:{icon:any;title:string;value:string}){return <div className="stat">{icon}<span><small>{title}</small><b>{value}</b></span></div>}
export default App;
