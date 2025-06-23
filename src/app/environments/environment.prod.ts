export const environment = {
  production: true,
  apiUrl: 'http://43.209.102.40:3000/api',
  imgbb: {
    apiUrl: 'https://api.imgbb.com/1/upload',
    apiKey: '62e768cda1cad5a0b7e3930058a3a561'
  },
  tokenExpireTime: 3600,
  cacheDuration: {
    seat: 30 * 1000,
    transaction: 15 * 1000
  }
};