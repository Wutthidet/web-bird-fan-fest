export const environment = {
  production: false,
  apiUrl: 'https://aticket-api.ampolfood.com/api',
  imageUpload: {
    apiUrl: 'https://ai.ampolfood.com:5555/webhook/2d3b5473-9607-4235-b062-652cfc8187db'
  },
  tokenExpireTime: 3600,
  cacheDuration: {
    seat: 30 * 1000,
    transaction: 15 * 1000
  }
};