import {useEffect,useMemo,useRef,useState} from "react";
import{CloudSun,ChevronDown,MapPin,RefreshCw,Sun,Thermometer,ThermometerSnowflake}from"lucide-react";
import*as echarts from"echarts";
import{archive,baseline,forecast,searchLocations}from"./api";
import type{Location,WeatherResponse}from"./types";
import{fmt,fmtFull,fmtWeekdayDate,icon,label,localToday,hourLabel}from"./weather";
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
function rangeSeries(key:string,seriesLabel:string,points:Point[],color:string,dash:"dashed"|"dotted"):any[]{
  const stack=`${key}Band`;
  const minData=points.map(p=>[p.date,p.min??null]);
  const maxData=points.map(p=>[p.date,p.max??null]);
  const deltaData=points.map(p=>[p.date,(p.min!=null&&p.max!=null)?+(p.max-p.min).toFixed(2):null]);
  return [
    {name:`${seriesLabel} min`,type:"line",data:minData,stack,smooth:.2,showSymbol:false,lineStyle:{width:1.25,type:dash,color,opacity:.6},itemStyle:{color},areaStyle:{opacity:0}},
    {name:`__${key}fill`,type:"line",data:deltaData,stack,smooth:.2,showSymbol:false,lineStyle:{opacity:0},itemStyle:{color},areaStyle:{color,opacity:.14},tooltip:{show:false}},
    {name:`${seriesLabel} max`,type:"line",data:maxData,smooth:.2,showSymbol:false,lineStyle:{width:1.25,type:dash,color,opacity:.6},itemStyle:{color}}
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
          ...rangeSeries("typical","Typical",typical,"#8293a8","dashed"),
          ...rangeSeries("observed","Observed",observed,"#55b7ff","dashed"),
          ...(showForecast&&forecastPoints.length?rangeSeries("forecast","Forecast",forecastPoints,"#b08cff","dotted"):[])
        ]
      : [
          {name:"Typical",type:"line",data:typical.map(x=>[x.date,x.value]),smooth:true,showSymbol:false,lineStyle:{type:"dashed",width:2,color:"#8293a8"},itemStyle:{color:"#8293a8"}},
          {name:"Observed",type:"line",data:observed.map(x=>[x.date,x.value]),smooth:.18,showSymbol:false,lineStyle:{width:3,color:"#55b7ff"},itemStyle:{color:"#55b7ff"},areaStyle:{color:"rgba(85,183,255,.08)"}},
          ...(showForecast&&forecastPoints.length?[{name:"Forecast",type:"line",data:forecastPoints.map(x=>[x.date,x.value]),smooth:.18,showSymbol:false,lineStyle:{type:"dotted",width:3,color:"#b08cff"},itemStyle:{color:"#b08cff"}}]:[])
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

    c.setOption({animationDuration:450,tooltip:{trigger:"axis",backgroundColor:"#081522",borderColor:"#29425e",textStyle:{color:"#fff"},axisPointer:{lineStyle:{color:"#49647e"}},formatter:(p:any[])=>{const rows=p.filter(x=>x.value?.[1]!=null&&!String(x.seriesName).startsWith("__"));if(!rows.length)return"";return `<div style="font-weight:700;margin-bottom:6px">${fmtFull(String(rows[0].axisValue))}</div>`+rows.map(x=>`<div style="display:flex;gap:7px;align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:${x.color};display:inline-block"></span>${x.seriesName}<b style="margin-left:auto">${(+x.value[1]).toFixed(1)}${unit}</b></div>`).join("")}},grid:{left:8,right:18,top:24,bottom:74,containLabel:true},xAxis:{type:"category",boundaryGap:false,data:dates,axisLabel:{color:"#71859d",interval:(index:number,_value:string)=>Number(dates[index]?.slice(8,10))===1,formatter:(v:string)=>monthLabel(v)},axisLine:{lineStyle:{color:"#26394d"}}},yAxis:{type:"value",scale:true,axisLabel:{color:"#71859d",formatter:`{value}${unit}`},splitLine:{lineStyle:{color:"rgba(150,170,200,.09)"}}},dataZoom:[{type:"slider",start:0,end:100,height:22,bottom:8,showDetail:false,borderColor:"#26394d",backgroundColor:"#091725",fillerColor:"rgba(85,183,255,.16)",handleStyle:{color:"#55b7ff",borderColor:"#55b7ff"},moveHandleStyle:{color:"#344b63"}},{type:"inside",start:0,end:100}],series});

    // When the visible range sits entirely inside one calendar month, show that month's name
    // centered along the axis — the boundary dividers alone aren't visible unless a month edge
    // happens to be in view, so this covers the "zoomed into the middle of a month" case.
    const setMonthCaption=(text:string|null)=>{
      c.setOption({graphic:text?[{type:"text",silent:true,left:"center",bottom:56,style:{text,font:"700 13px \"Space Grotesk\"",fill:"rgba(237,245,255,.55)"}}]:[]});
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
  return <div className="legend">{showObserved&&<span><i className="legendLine observedLine"/>Observed</span>}{showForecast&&<span><i className="legendLine forecastLine"/>Forecast</span>}<span><i className="legendLine typicalLine"/>Typical 1991–2020</span><small>Hover for exact values · drag the range handles to focus a period</small></div>
}

function RangeToggle({showRange,setShowRange}:{showRange:boolean;setShowRange:(v:boolean)=>void}){
  return <div className="rangeToggle"><small>RANGE</small><div className="switch"><button type="button" className={!showRange?"active":""} onClick={()=>setShowRange(false)}>Avg</button><button type="button" className={showRange?"active":""} onClick={()=>setShowRange(true)}>Min/Max</button></div></div>
}

function DayCard({d,i,selected,onClick,conv}:{d:any;i:number;selected:boolean;onClick:()=>void;conv:(n:number)=>number}){
 return <button className={`day ${selected?"selected":""}`} onClick={onClick}><small>{i===0?"Today":new Date(d.date+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"})}</small><b>{icon(d.code)}</b><strong><small className="hl">H</small>{Math.round(conv(d.max))}°</strong><span><small className="hl">L</small>{Math.round(conv(d.min))}°</span><p>{label(d.code)}</p><small className="dayMeta"><span>💧 {Math.round(d.rain)}%</span> · <span>{Math.round(d.wind)} km/h</span></small></button>
}

/** Compact hour-by-hour temperature curve shown above the hourly detail cards. */
function HourlyChart({hours,unit}:{hours:{time:string;temp:number;feels:number;rain:number}[];unit:string}){
  const chartRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const el=chartRef.current;
    if(!el)return;
    const c=echarts.init(el);
    c.setOption({animationDuration:400,tooltip:{trigger:"axis",backgroundColor:"#081522",borderColor:"#29425e",textStyle:{color:"#fff"},axisPointer:{lineStyle:{color:"#49647e"}},formatter:(p:any[])=>{const rows=p.filter(x=>x.value?.[1]!=null);if(!rows.length)return"";return `<div style="font-weight:700;margin-bottom:6px">${hourLabel(String(rows[0].axisValue))}</div>`+rows.map(x=>`<div style="display:flex;gap:7px;align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:${x.color};display:inline-block"></span>${x.seriesName}<b style="margin-left:auto">${x.seriesName==="Chance of rain"?Math.round(+x.value[1])+"%":(+x.value[1]).toFixed(1)+unit}</b></div>`).join("")}},grid:{left:6,right:12,top:18,bottom:26,containLabel:true},xAxis:{type:"category",boundaryGap:false,data:hours.map(h=>h.time),axisTick:{interval:0},axisLabel:{color:"#71859d",interval:0,fontSize:9,formatter:(v:string)=>hourLabel(v)},axisLine:{lineStyle:{color:"#26394d"}}},yAxis:[
      {type:"value",scale:true,axisLabel:{color:"#71859d",formatter:`{value}${unit}`},splitLine:{lineStyle:{color:"rgba(150,170,200,.09)"}}},
      {type:"value",min:0,max:100,show:false}
    ],series:[
      {name:"Chance of rain",type:"line",yAxisIndex:1,data:hours.map(h=>[h.time,h.rain]),smooth:.25,showSymbol:false,lineStyle:{opacity:0},areaStyle:{color:"rgba(111,190,201,.22)"},z:1},
      {name:"Temperature",type:"line",data:hours.map(h=>[h.time,h.temp]),smooth:.25,showSymbol:false,lineStyle:{width:3,color:"#55b7ff"},itemStyle:{color:"#55b7ff"},areaStyle:{color:"rgba(85,183,255,.1)"},z:2},
      {name:"Feels like",type:"line",data:hours.map(h=>[h.time,h.feels]),smooth:.25,showSymbol:false,lineStyle:{width:2,type:"dashed",color:"#f2a65a"},itemStyle:{color:"#f2a65a"},z:2}
    ]});
    const ro=new ResizeObserver(()=>c.resize());
    ro.observe(el);
    return()=>{ro.disconnect();c.dispose()};
  },[hours,unit]);
  return <div className="hourlyChart" ref={chartRef}/>;
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

/** Average temperature across the hours between sunrise and sunset, if both are known. */
function daytimeAverage(hours:{time:string;temp:number}[],sunrise?:string,sunset?:string):number|null{
  if(!sunrise||!sunset)return null;
  const sh=Number(sunrise.slice(11,13)),eh=Number(sunset.slice(11,13));
  const daytime=hours.slice(0,24).filter(h=>{const hh=Number(h.time.slice(11,13));return hh>=sh&&hh<eh});
  if(!daytime.length)return null;
  return daytime.reduce((a,h)=>a+h.temp,0)/daytime.length;
}

function HourlyDetails({day,hours,sunrise,sunset,timezone,unit,conv}:{day:any;hours:{time:string;temp:number;feels:number;rain:number;wind:number;code:number}[];sunrise?:string;sunset?:string;timezone:string;unit:string;conv:(n:number)=>number}){
 const dayHours=hours.slice(0,24);
 const temps=dayHours.map(h=>h.temp);
 const minIdx=temps.length?temps.indexOf(Math.min(...temps)):-1;
 const maxIdx=temps.length?temps.indexOf(Math.max(...temps)):-1;
 const daytimeAvg=daytimeAverage(hours,sunrise,sunset);
 return <div className="hourlyPanel"><div className="hourlyHead"><div><label>HOURLY DETAIL</label><h3>{fmtWeekdayDate(day.date)}</h3></div><span>Local time · {timezone}</span></div>
 {(sunrise||sunset||daytimeAvg!=null)&&<div className="dayFacts">
   {sunrise&&<span>☀️ Sunrise {hm(sunrise)}</span>}
   {sunset&&<span>🌇 Sunset {hm(sunset)}</span>}
   {daytimeAvg!=null&&<span>🌡️ Daytime avg {Math.round(conv(daytimeAvg))}{unit}</span>}
 </div>}
 <HourlyChart hours={hours.map(h=>({time:h.time,temp:conv(h.temp),feels:conv(h.feels),rain:h.rain}))} unit={unit}/>
 <div className="hourlyTableOuter">
   <div className="hourlyLabels">
     <div className="hlabel hlabel-hour"> </div>
     <div className="hlabel hlabel-icon"> </div>
     <div className="hlabel hlabel-precip">Rain chance</div>
     <div className="hlabel hlabel-temp">Temp</div>
     <div className="hlabel hlabel-feels">Feels like</div>
     <div className="hlabel hlabel-wind">Wind km/h</div>
   </div>
   <div className="hourlyTableWrap"><div className="hourlyTable">{hours.map((h,idx)=><div className="hcol" key={h.time}>
     <div className="hcol-hour">{idx===24?"24H":`${Number(h.time.slice(11,13))}H`}</div>
     <div className="hcol-icon">{icon(h.code)}</div>
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
       const h=await archive(loc,y,y===yearNow?today:undefined,controller.signal);
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
 const days=data?.daily.time.slice(0,7).map((date,i)=>({date,min:data.daily.temperature_2m_min?.[i]??0,max:data.daily.temperature_2m_max?.[i]??0,rain:data.daily.precipitation_probability_max?.[i]??0,wind:data.daily.wind_speed_10m_max?.[i]??0,humidity:data.daily.relative_humidity_2m_mean?.[i]??0,uv:data.daily.uv_index_max?.[i]??0,code:data.daily.weather_code?.[i]??0}))??[];
 const selected=days[selectedDay];
 // 25 points, not 24: the 25th is midnight of the next day, so the chart/table visibly reach
 // the end of the day instead of stopping at 11 PM. Computed once here and reused by the chart,
 // the table, and the generated summary sentence below.
 const selectedHours=useMemo(()=>{
   if(!data||!selected)return[];
   const start=data.hourly.time.findIndex(x=>x.startsWith(selected.date));
   if(start<0)return[];
   return Array.from({length:25},(_,j)=>{const i=start+j;return{time:data.hourly.time[i],temp:data.hourly.temperature_2m?.[i]??0,feels:data.hourly.apparent_temperature?.[i]??0,rain:data.hourly.precipitation_probability?.[i]??0,wind:data.hourly.wind_speed_10m?.[i]??0,code:data.hourly.weather_code?.[i]??0}}).filter(h=>h.time);
 },[data,selected]);
 const daySummaryText=selected&&selectedHours.length?daySummary(selectedHours.slice(0,24),selected.code,conv,unit):"";
 const selectedSunrise=data?.daily.sunrise?.[selectedDay];
 const selectedSunset=data?.daily.sunset?.[selectedDay];
 return <><header><div className="brand"><span><CloudSun size={21}/></span><b>Weather Dashboard</b><small>weather · climate · context</small></div><div className="controls"><LocationPicker loc={loc} setLoc={setLoc}/><select value={unit} onChange={e=>setUnit(e.target.value)}><option>°C</option><option>°F</option></select></div></header>
 <main><div className="hero"><div><h1>{loc.name}<em>, {loc.country}</em></h1></div><aside><small>LOCAL DATE</small><b>{fmt(localToday(loc.timezone),{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</b></aside></div>
 {err&&<div className="error">{err}</div>}
 <section><div className="head"><div><label>7-DAY FORECAST</label><h2>{daySummaryText||"Select a day to open the full 24-hour forecast."}</h2></div></div><div className="days">{days.map((d,i)=><DayCard key={d.date} d={d} i={i} selected={i===selectedDay} onClick={()=>setSelectedDay(i)} conv={conv}/>)}</div>{selected&&data&&<HourlyDetails day={selected} hours={selectedHours} sunrise={selectedSunrise} sunset={selectedSunset} timezone={data.timezone} unit={unit} conv={conv}/>}</section>
 <section><div className="head"><div><label>ANNUAL TEMPERATURE</label><h2>Temperature through the year</h2><p>Compare observed temperatures with the seasonal baseline and near-term forecast.</p></div><div className="headControls"><RangeToggle showRange={showRange} setShowRange={setShowRange}/><div className="year"><small>YEAR</small><div className="yearRow"><select value={y} onChange={e=>setY(+e.target.value)}>{Array.from({length:41},(_,i)=>yearNow-20+i).map(n=><option key={n}>{n}</option>)}</select><button title="Reset to current year" onClick={()=>setY(yearNow)}><RefreshCw size={15}/></button></div></div></div></div>
 <Legend showObserved={showObserved} showForecast={showForecast}/>{loading?<div className="loading">Loading weather data…</div>:<TemperatureChart observed={obs} typical={typical} forecastPoints={future} unit={unit} showForecast={showForecast} showRange={showRange} onVisibleRangeChange={(start,end)=>setVisibleRange(prev=>(prev&&prev.start===start&&prev.end===end)?prev:{start,end})}/>}
 <div className="zoomGuide"><div><b>Focus the chart</b><span>Use the handles below to choose a date range, or scroll inside the chart to zoom.</span></div><span className="rangeHint">◀ drag handles · ▶ drag range</span></div>
 {noteText&&<div className="note">{noteText}</div>}
 <div className="statsBlock"><div className="statsHead"><label>YEAR SUMMARY</label><span>{rangeSummaryLabel(visibleRange,y)}</span></div><div className="stats"><Stat icon={<ThermometerSnowflake/>} title="Coldest" value={visibleMins.length?Math.min(...visibleMins).toFixed(1)+unit:"—"}/><Stat icon={<Thermometer/>} title="Average" value={visibleObs.length?(visibleObs.reduce((a,b)=>a+b.value,0)/visibleObs.length).toFixed(1)+unit:"—"}/><Stat icon={<Sun/>} title="Warmest" value={visibleMaxs.length?Math.max(...visibleMaxs).toFixed(1)+unit:"—"}/></div></div>
 </section>
 <footer>Open-Meteo weather data · historical data uses reanalysis</footer></main></>
}
function Stat({icon,title,value}:{icon:any;title:string;value:string}){return <div className="stat">{icon}<span><small>{title}</small><b>{value}</b></span></div>}
export default App;
