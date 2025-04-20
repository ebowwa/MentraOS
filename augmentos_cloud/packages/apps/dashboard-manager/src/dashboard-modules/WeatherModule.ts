import axios from 'axios';
import { logger } from '@augmentos/utils';

export interface WeatherSummary {
  condition: string;
  temp_f: number;
}

export class WeatherModule {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = "53394e85a9b325c2f46e7e097859a7b8";
    this.baseUrl = 'https://api.openweathermap.org';
    logger.info('🌤️ WeatherModule initialized');
  }

  /**
   * Fetch the current weather condition and temperature in Fahrenheit.
   */
  public async fetchWeatherForecast(latitude: number, longitude: number): Promise<WeatherSummary | null> {
    const url = `${this.baseUrl}/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,hourly,daily,alerts&units=imperial&appid=${this.apiKey}`;
    logger.info(`🌤️ Fetching weather data for lat=${latitude}, lon=${longitude}`);
    
    try {
      const response = await axios.get(url);
      const data = response.data;
      
      if (!data || !data.current || !data.current.weather || data.current.weather.length === 0) {
        logger.error('❌ Unexpected weather API response structure:', data);
        return null;
      }

      const weatherSummary = {
        condition: data.current.weather[0].main,
        temp_f: Math.round(data.current.temp),
      };
      
      logger.info(`✅ Weather data fetched successfully: ${weatherSummary.condition}, ${weatherSummary.temp_f}°F`);
      return weatherSummary;
    } catch (error) {
      logger.error('❌ Error fetching weather data:', error);
      return null;
    }
  }
}
