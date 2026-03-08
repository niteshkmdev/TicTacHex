const ALLOWED_ORIGINS = new Set(['http://localhost:5500', 'http://127.0.0.1:5500', 'https://niteshkmdev.github.io']);

function corsHeaders(origin) {
	if (!ALLOWED_ORIGINS.has(origin)) return {};
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400',
	};
}

export class Matchmaker {
	constructor(state, env) {
		this.state = state;
	}

	async fetch(request) {
		const origin = request.headers.get('Origin') || '';
		const headers = corsHeaders(origin);

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers });
		}

		if (!ALLOWED_ORIGINS.has(origin)) {
			return new Response('Forbidden', { status: 403 });
		}

		const { peerId } = await request.json();

		let waiting = await this.state.storage.get('waitingPlayer');
		let matches = (await this.state.storage.get('matches')) || {};

		// If this player already has a match assigned
		if (matches[peerId]) {
			const match = matches[peerId];
			delete matches[peerId];
			await this.state.storage.put('matches', matches);

			return new Response(
				JSON.stringify({
					matchFound: true,
					opponentPeerId: match.opponentPeerId,
					isHost: match.isHost,
				}),
				{
					headers: {
						...headers,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// No waiting player → become waiting player
		if (!waiting) {
			await this.state.storage.put('waitingPlayer', {
				peerId,
			});

			return new Response(
				JSON.stringify({
					waiting: true,
				}),
				{
					headers: {
						...headers,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// If same player polling again
		if (waiting.peerId === peerId) {
			return new Response(
				JSON.stringify({
					waiting: true,
				}),
				{
					headers: {
						...headers,
						'Content-Type': 'application/json',
					},
				},
			);
		}

		// Match found
		const opponent = waiting.peerId;

		await this.state.storage.delete('waitingPlayer');

		matches[opponent] = {
			opponentPeerId: peerId,
			isHost: true,
		};

		await this.state.storage.put('matches', matches);

		return new Response(
			JSON.stringify({
				matchFound: true,
				opponentPeerId: opponent,
				isHost: false,
			}),
			{
				headers: {
					...headers,
					'Content-Type': 'application/json',
				},
			},
		);
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === '/match') {
			const id = env.MATCHMAKER.idFromName('global');
			const obj = env.MATCHMAKER.get(id);

			return obj.fetch(request);
		}

		const origin = request.headers.get('Origin') || '';
		return new Response('OK', { headers: corsHeaders(origin) });
	},
};
