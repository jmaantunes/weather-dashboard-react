export type Location={id:number;name:string;country:string;country_code:string;latitude:number;longitude:number;timezone:string;admin1?:string};
export type Daily={time:string[];temperature_2m_mean?:number[];temperature_2m_max?:number[];temperature_2m_min?:number[];weather_code?:number[];precipitation_sum?:number[];precipitation_probability_max?:number[];wind_speed_10m_max?:number[];relative_humidity_2m_mean?:number[];uv_index_max?:number[]};
export type Hourly={time:string[];temperature_2m?:number[];apparent_temperature?:number[];relative_humidity_2m?:number[];precipitation_probability?:number[];precipitation?:number[];weather_code?:number[];wind_speed_10m?:number[];cloud_cover?:number[];uv_index?:number[]};
export type WeatherResponse={timezone:string;daily:Daily;hourly:Hourly};
