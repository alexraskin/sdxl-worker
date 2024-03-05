import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { logger } from 'hono/logger';
import { timing, startTime, endTime } from 'hono/timing';
import { Ai } from '@cloudflare/ai';

import indexHtml from './public/index.html';

type Bindings = {
	AI: Ai;
	R2: R2Bucket;
};

interface BodyInputs {
	prompt: string;
	num_steps?: number;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use(
	'*',
	cors({
		origin: 'https://imagine.00z.sh',
		allowHeaders: ['*'],
		allowMethods: ['POST', 'GET'],
	}),
);

app.use(timing());
app.use('*', logger());
app.use('*', prettyJSON());

app.get('/', async (c: Context) => {
	c.header('Content-Type', 'text/html');
	return c.body(indexHtml);
});

app.post('/', async (c: Context) => {
	startTime(c, 'ai');
	const body = await c.req.json();
	const ai = new Ai(c.env.AI);

	const model = body.model || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
	console.log('model', model);

	const inputs: BodyInputs = {
		prompt: body.prompt,
		num_steps: body.num_steps || 20,
	};

	let response: Uint8Array = new Uint8Array();

	try {
		response = await ai.run(model, inputs);
	} catch (e) {
		if (e instanceof Error) {
			c.header('Content-Type', 'application/json');
			console.error(e.message, e.stack, e.name);
			return c.json({ message: 'An error cccured - Please try again', ok: false }, 500);
		}
	}
	const key: string = c.req.header('cf-ray') + '.png';

	c.executionCtx.waitUntil(c.env.R2.put(key, response));

	c.header('Content-Type', 'image/png');
	endTime(c, 'ai');
	return c.body(response);
});

export default app;
