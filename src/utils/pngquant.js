// Pulled from https://github.com/psych0der/pngquantjs

let waitingResolve = null;
let waitingReject = null;
let worker = new Worker("pngquant/worker.js");
worker.onmessage = (event) => {
	let message = event.data;
	if(message.type === 'start') {
		// eslint-disable-next-line
		console.log('worker started');
	} else if(message.type === 'stdout') {
		// eslint-disable-next-line
		console.log(`Worker message: ${message.data}`);
	} else if(message.type === 'done') {
		let buffers = message.data;
		if(buffers.length === 1 && buffers[0] instanceof Error) {
			console.error(`Worker error: ${buffers[0]}`);
			waitingReject(buffers[0]);

			waitingResolve = null;
			waitingReject = null;
		} else {
			waitingResolve(buffers[0].data);

			waitingResolve = null;
			waitingReject = null;
		}
	}
};

export default async function pngquant(inputImageData, args = {}) {
	if(waitingResolve) {
		console.error('Trying to start a new job while something is still running');
		return;
	}

	return new Promise((resolve, reject) => {
		worker.postMessage({
			type: 'command',
			arguments: args,
			file: {
				name: 'input.png',
				data: inputImageData
			}
		});

		waitingResolve = resolve;
		waitingReject = reject;
	});
}