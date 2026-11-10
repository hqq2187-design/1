const webpush=require('web-push');const {Redis}=require('@upstash/redis');
function redis(){if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)throw new Error('Upstash Redis 环境变量未配置');return new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});}
function setup(){if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)throw new Error('VAPID 密钥未配置');webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);}
function json(res,status,obj){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').send(JSON.stringify(obj));}
module.exports={redis,setup,json,webpush};
