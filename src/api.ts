import type{Location,WeatherResponse}from"./types";
const F="https://api.open-meteo.com/v1/forecast",A="https://archive-api.open-meteo.com/v1/archive",G="https://geocoding-api.open-meteo.com/v1/search";

// Tiny in-memory response cache, keyed by full request URL. Weather/baseline data for a given
// location+year doesn't change within a session, so re-visiting a year or re-selecting a
// recently-used city shouldn't cost another network call — this is the biggest lever against
// hitting Open-Meteo's free-tier rate limit (600/min, 10k/day, no key needed).
const cache=new Map<string,unknown>();

async function get<T>(u:string,signal?:AbortSignal,retries=2):Promise<T>{
  const cached=cache.get(u);
  if(cached!==undefined)return cached as T;
  let attempt=0;
  for(;;){
    const r=await fetch(u,{signal});
    if(r.status===429&&attempt<retries){
      // Back off and retry a couple of times before giving up — bursty UI interactions
      // (rapid year changes, React StrictMode's dev-only double-invoke) can otherwise
      // trip the rate limit even well under the daily quota.
      await new Promise(res=>setTimeout(res,600*Math.pow(2,attempt)));
      attempt++;
      continue;
    }
    if(!r.ok)throw Error(r.status===429?"Rate limited by the weather API — please wait a moment and try again.":`Weather API error ${r.status}`);
    const data=await r.json() as T;
    cache.set(u,data);
    return data;
  }
}

const q=(x:Record<string,string|number|undefined>)=>new URLSearchParams(Object.entries(x).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]));
export async function searchLocations(name:string,signal?:AbortSignal){const d=await get<{results?:Location[]}>(`${G}?${q({name,count:10,language:"en",format:"json"})}`,signal);return d.results??[]}
const hourly="temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,cloud_cover,uv_index";
const daily="weather_code,temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,uv_index_max";
export async function forecast(l:Location,signal?:AbortSignal){return get<WeatherResponse>(`${F}?${q({latitude:l.latitude,longitude:l.longitude,timezone:l.timezone,forecast_days:16,daily,hourly})}`,signal)}
export async function archive(l:Location,y:number,end?:string,signal?:AbortSignal){return get<WeatherResponse>(`${A}?${q({latitude:l.latitude,longitude:l.longitude,timezone:l.timezone,start_date:`${y}-01-01`,end_date:end??`${y}-12-31`,daily:"temperature_2m_mean,temperature_2m_max,temperature_2m_min",hourly})}`,signal)}
export async function baseline(l:Location,signal?:AbortSignal){return get<WeatherResponse>(`${A}?${q({latitude:l.latitude,longitude:l.longitude,timezone:l.timezone,start_date:"1991-01-01",end_date:"2020-12-31",daily:"temperature_2m_mean,temperature_2m_max,temperature_2m_min"})}`,signal)}
