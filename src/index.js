import puppeteer from '@cloudflare/puppeteer';

const NEWS_WEBSITES = [
	'https://wyborcza.pl',
	'https://onet.pl',
	'https://oko.press',
	'https://pap.pl',
	'https://polityka.pl',
	'https://abcnews.go.com',
	'https://theguardian.com',
];

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === '/images') {
			const list = await env.KIOSK_24_KV.list();
			const imageInfo = list.keys.map((key) => {
				const [hostname, date, time] = key.name.split('_');
				return {
					name: key.name,
					hostname: hostname.replace(/-/g, '.'),
					date,
					time: time.replace('.jpeg', '').replace(/-/g, ':'),
				};
			});
			return new Response(JSON.stringify(imageInfo), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}

		if (url.pathname.startsWith('/image/')) {
			const imageName = url.pathname.split('/image/')[1];
			const image = await env.KIOSK_24_KV.get(imageName, 'arrayBuffer');

			if (image === null) {
				return new Response('Image not found', { status: 404 });
			}

			return new Response(image, {
				headers: {
					'Content-Type': 'image/jpeg',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}

		return new Response('Worker Works!!!');
	},

	async scheduled(event, env, ctx) {
		ctx.waitUntil(processUrls(env));
	},
};

async function processUrls(env) {
	let browser;
	try {
		browser = await puppeteer.launch(env.MYBROWSER);

		const processUrl = async (url) => {
			const page = await browser.newPage();
			await page.goto(url);
			let img = await page.screenshot({
				type: 'jpeg',
				fullPage: true,
				quality: 60,
				clip: {
					x: 0,
					y: 0,
					width: 1440,
					height: 2000,
				},
			});

			const hostname = new URL(url).hostname.replace(/^www\./, '').replace(/\./g, '-');
			const now = new Date();
			const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
			const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-mm-ss
			const filename = `${hostname}_${date}_${time}.jpeg`;

			await env.KIOSK_24_KV.put(`${filename}`, img);
			await page.close();
		};

		await Promise.all(NEWS_WEBSITES.map(processUrl));
	} catch (error) {
		console.error('Error processing URLs:', error);
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}
