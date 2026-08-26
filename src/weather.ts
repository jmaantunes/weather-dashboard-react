// WMO weather codes (used by Open-Meteo) distinguish intensity (light/moderate/heavy,
// drizzle/rain/showers, snow vs snow grains, plain vs freezing, thunderstorm vs hail) — mapped
// here 1:1 rather than the old coarse ranges, so the "Sky" icon actually reflects that detail.
// `isDay` (from the API's `is_day` field) swaps clear/mostly-clear/partly-cloudy to a moon
// variant at night; when it's not supplied (`undefined`, e.g. daily-level codes that have no
// per-hour day/night concept), this always falls back to the daytime glyph rather than
// guessing — never invented, only shown when the fetched data actually says it's night.
export const label=(c:number)=>{
  switch(c){
    case 0:return"Clear";
    case 1:return"Mostly clear";
    case 2:return"Partly cloudy";
    case 3:return"Overcast";
    case 45:case 48:return"Fog";
    case 51:return"Light drizzle";
    case 53:return"Drizzle";
    case 55:return"Dense drizzle";
    case 56:case 57:return"Freezing drizzle";
    case 61:return"Light rain";
    case 63:return"Rain";
    case 65:return"Heavy rain";
    case 66:case 67:return"Freezing rain";
    case 71:return"Light snow";
    case 73:return"Snow";
    case 75:return"Heavy snow";
    case 77:return"Snow grains";
    case 80:return"Rain showers";
    case 81:case 82:return"Heavy showers";
    case 85:case 86:return"Snow showers";
    case 95:return"Thunderstorm";
    case 96:case 99:return"Thunderstorm with hail";
    default:return"Mixed";
  }
};
export const icon=(c:number,isDay?:boolean)=>{
  const night=isDay===false;
  switch(c){
    case 0:return night?"🌙":"☀️";
    case 1:return night?"🌙":"🌤️";
    case 2:return night?"🌙☁️":"⛅";
    case 3:return"☁️";
    case 45:case 48:return"🌫️";
    case 51:case 53:return"🌦️";
    case 55:return"🌧️";
    case 56:case 57:return"🌨️";
    case 61:return"🌦️";
    case 63:return"🌧️";
    case 65:return"🌧️";
    case 66:case 67:return"🌨️";
    case 71:case 73:return"🌨️";
    case 75:case 77:return"❄️";
    case 80:return"🌦️";
    case 81:case 82:return"🌧️";
    case 85:case 86:return"🌨️";
    case 95:return"⛈️";
    case 96:case 99:return"⛈️";
    default:return"🌡️";
  }
};
export const fmt=(s:string,opt:Intl.DateTimeFormatOptions={})=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",...opt}).format(new Date(`${s}T12:00:00`));
export const localToday=(tz:string)=>{const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const g=(t:string)=>p.find(x=>x.type===t)?.value;return`${g("year")}-${g("month")}-${g("day")}`};
// The archive API's most recent available day trails "today" by a day or two (data-processing
// lag), so requesting up through today as end_date gets rejected with a 400. Subtracting a
// couple of days keeps this comfortably inside the API's actual coverage without needing to
// know the exact lag for every station/region.
export const daysBefore=(dateStr:string,days:number)=>{const d=new Date(`${dateStr}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10)};
// Open-Meteo returns timestamps already localized to the requested `timezone` (no UTC offset
// in the string). Reading the hour digits directly — rather than handing the string to `Date`,
// which the browser would reinterpret in *its own* timezone — keeps the label correct no
// matter where the visitor is relative to the selected city.
export const hourLabel=(s:string)=>{const h=Number(s.slice(11,13));const period=h<12?"AM":"PM";const h12=h%12===0?12:h%12;return`${h12} ${period}`};
// Same as hourLabel but keeps the minute when it isn't :00 — used by the hourly chart's hover
// tooltip now that hovering lands on arbitrary points between the hourly samples, not just on
// the hour.
export const preciseTimeLabel=(s:string)=>{const h=Number(s.slice(11,13)),m=Number(s.slice(14,16));const period=h<12?"AM":"PM";const h12=h%12===0?12:h%12;return m===0?`${h12} ${period}`:`${h12}:${String(m).padStart(2,"0")} ${period}`};
// "August 16th, 2026" — used in chart tooltips where the compact YYYY-MM-DD form isn't readable at a glance.
const ordinalSuffix=(n:number)=>{const v=n%100;if(v>=11&&v<=13)return"th";switch(n%10){case 1:return"st";case 2:return"nd";case 3:return"rd";default:return"th"}};
export const fmtFull=(s:string)=>{const d=new Date(`${s}T12:00:00`);return`${d.toLocaleString(undefined,{month:"long"})} ${d.getDate()}${ordinalSuffix(d.getDate())}, ${d.getFullYear()}`};
// "Sunday, 23 August" — built manually rather than via Intl's weekday+day+month combo, since
// the comma after the weekday isn't guaranteed across locales/formatting options.
export const fmtWeekdayDate=(s:string)=>{const d=new Date(`${s}T12:00:00`);return`${d.toLocaleDateString(undefined,{weekday:"long"})}, ${d.getDate()} ${d.toLocaleDateString(undefined,{month:"long"})}`};
