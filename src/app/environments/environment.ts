export const environment = {
  production: false,
  apiUrl: 'http://192.168.14.167:8000/api',
  tokenExpireTime: 3600,
  cacheDuration: {
    seat: 30 * 1000,
    transaction: 15 * 1000
  }
};
