export const label=(c:number)=>c===0?"Clear":c<=3?"Cloudy":c<=48?"Fog":c<=57?"Drizzle":c<=67||c>=80&&c<=82?"Rain":c<=86?"Snow":c>=95?"Thunderstorm":"Mixed";
export const icon=(c:number)=>c===0?"☀️":c<=3?"🌤️":c<=48?"🌫️":c<=57?"🌦️":c<=67||c>=80&&c<=82?"🌧️":c<=86?"🌨️":c>=95?"⛈️":"🌡️";
export const fmt=(s:string,opt:Intl.DateTimeFormatOptions={})=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",...opt}).format(new Date(`${s}T12:00:00`));
export const localToday=(tz:string)=>{const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const g=(t:string)=>p.find(x=>x.type===t)?.value;return`${g("year")}-${g("month")}-${g("day")}`};
// Open-Meteo returns timestamps already localized to the requested `timezone` (no UTC offset
// in the string). Reading the hour digits directly — rather than handing the string to `Date`,
// which the browser would reinterpret in *its own* timezone — keeps the label correct no
// matter where the visitor is relative to the selected city.
export const hourLabel=(s:string)=>{const h=Number(s.slice(11,13));const period=h<12?"AM":"PM";const h12=h%12===0?12:h%12;return`${h12} ${period}`};
// "August 16th, 2026" — used in chart tooltips where the compact YYYY-MM-DD form isn't readable at a glance.
const ordinalSuffix=(n:number)=>{const v=n%100;if(v>=11&&v<=13)return"th";switch(n%10){case 1:return"st";case 2:return"nd";case 3:return"rd";default:return"th"}};
export const fmtFull=(s:string)=>{const d=new Date(`${s}T12:00:00`);return`${d.toLocaleString(undefined,{month:"long"})} ${d.getDate()}${ordinalSuffix(d.getDate())}, ${d.getFullYear()}`};
// "Sunday, 23 August" — built manually rather than via Intl's weekday+day+month combo, since
// the comma after the weekday isn't guaranteed across locales/formatting options.
export const fmtWeekdayDate=(s:string)=>{const d=new Date(`${s}T12:00:00`);return`${d.toLocaleDateString(undefined,{weekday:"long"})}, ${d.getDate()} ${d.toLocaleDateString(undefined,{month:"long"})}`};
