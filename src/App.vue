<template>
	<div id="app" @drop.prevent="droppedFiles" @dragover.prevent>
		
	</div>
</template>

<script>
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { LoadingManager } from 'three/src/loaders/LoadingManager';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/dat.gui.module';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import axios from 'axios';

const MAX_ANGLE = Math.PI / 8;

export default {
	data: () => {
		let angleCount = 16;
		let angles = {};
		for(let i = 0; i < angleCount; i++) {
			let angle = (360 / angleCount) * i;
			let radians = angle * Math.PI / 180;
			angles[angle] = [-Math.cos(radians) * MAX_ANGLE, 1.05, Math.sin(radians) * MAX_ANGLE];
		}

		return {
			currentModel: null,
			modelReady: false,
			renderer: null,
			camera: null,
			gui: null,
			scene: null,
			mixer: null,
			activeAction: null,
			animationActions: {},
			animationsFolder: null,
			modelFolder: null,
			actionsFolder: null,
			recordParams: {
				Frames: 10
			},
			frameSize: 256,
			sheetSize: 4096,
			angles
		};
	},
	methods: {
		setAction(toAction) {
			if(toAction != this.activeAction) {
				let lastAction = this.activeAction;
				this.activeAction = toAction;
				if(lastAction) {
					lastAction.stop();
				}
				// For taking screenshots we want an instant transition to start recording
				/*lastAction.fadeOut(1);
				this.activeAction.reset();
				this.activeAction.fadeIn(1);*/
				this.activeAction.play();
			}
		},

		async recordAllAsFrames(name = 'test') {
			let angleNames = Object.keys(this.angles);
			angleNames.sort((a, b) => {
				return parseInt(a) - parseInt(b);
			});
			let animationNames = Object.keys(this.animationActions);

			let zip = new JSZip();
			for(let j = 0; j < animationNames.length; j++) {
				for(let i = 0; i < angleNames.length; i++) {
					let angleName = angleNames[i];

					this.camera.position.set(...this.angles[angleName]);
					let animationName = animationNames[j];
					let { action, frames } = this.animationActions[animationName];

					console.log(`Generating ${animationName} animation at angle ${angleName}`);
					await this.generateFrameFromAnimation(zip, action, frames, `${animationName} ${angleName}`);
				}
			}

			zip.generateAsync({
				type: 'blob',
				streamFiles: true
			}/*, (metadata) => {
				console.log('update: ', metadata);
			}*/).then((content) => {
				saveAs(content, `${name}.zip`);
			});
		},
		async recordAllAsSheets(name = 'test') {
			let angleNames = Object.keys(this.angles);
			angleNames.sort((a, b) => {
				return parseInt(a) - parseInt(b);
			});
			let animationNames = Object.keys(this.animationActions);

			let options = this.initRecordings(name);
			for(let j = 0; j < animationNames.length; j++) {
				for(let i = 0; i < angleNames.length; i++) {
					let angleName = angleNames[i];

					this.camera.position.set(...this.angles[angleName]);
					let animationName = animationNames[j];
					let { action, frames } = this.animationActions[animationName];

					console.log(`Generating ${animationName} animation at angle ${angleName}`);
					await this.drawFramesFromAnimation(options, action, frames, animationName, angleName);
				}
			}
			this.finishRecordings(options);

			options.zip.generateAsync({
				type: 'blob',
				streamFiles: true
			}/*, (metadata) => {
				console.log('update: ', metadata);
			}*/).then((content) => {
				saveAs(content, `${name}.zip`);
			});
		},
		async recordAnimation(action, name = 'test') {
			let options = this.initRecordings(name);
			await this.drawFramesFromAnimation(options, action, null, name, 0);
			this.finishRecordings(options);

			options.zip.generateAsync({
				type: 'blob'
			}).then((content) => {
				saveAs(content, `${name}.zip`);
			});
		},
		initRecordings(modelName) {
			let canvas = document.createElement('canvas');
			canvas.width = this.sheetSize;
			canvas.height = this.sheetSize;
			let ctx = canvas.getContext('2d');

			return {
				zip: new JSZip(),
				canvas,
				ctx,
				row: 0,
				column: 0,
				sheet: 0,
				json: {},
				modelName
			};
		},
		finishRecordings(options) {
			if(options.column > 0 || options.row > 0) {
				options.zip.file(`${options.modelName}_${options.sheet}.png`, options.canvas.toDataURL('image/png').replace('data:image/png;base64,', ''), { base64: true });
			}

			options.zip.file('animations.json', JSON.stringify(options.json, null, '\t'));
		},

		async generateFrameFromAnimation(zip, action, frames, frameName) {
			this.setAction(action);

			let duration = action._clip.duration;
			const FRAMES = frames || this.recordParams.Frames;
			let skipTime = Math.floor(duration / FRAMES / 16.6 * 1000);

			await raf();
			for(let i = 0; i < FRAMES; i++) {
				zip.file(`${frameName} ${i + 1}.png`, this.getPNGDataUrl().replace('data:image/png;base64,', ''), { base64: true });

				for(let j = 0; j < skipTime; j++) {
					await raf();
				}
			}
		},
		async drawFramesFromAnimation(options, action, frames, animationName, angle) {
			this.setAction(action);

			let duration = action._clip.duration;
			const FRAMES = frames || this.recordParams.Frames;
			let skipTime = Math.floor(duration / FRAMES / 16.6 * 1000);

			await raf();
			for(let i = 0; i < FRAMES; i++) {
				this.drawFrameFromAnimation(options, animationName, angle);

				for(let j = 0; j < skipTime; j++) {
					await raf();
				}
			}
		},
		async drawFrameFromAnimation(options, animationName, angle) {
			options.ctx.drawImage(this.renderer.domElement, options.column * this.frameSize, options.row * this.frameSize);
			
			const maxSize = this.sheetSize / this.frameSize;
			if(!options.json[animationName]) {
				options.json[animationName] = {
					sheet: `${options.modelName}_${options.sheet}.png`,
					directions: {}
				};
			}
			if(!options.json[animationName].directions[angle]) {
				options.json[animationName].directions[angle] = [];
			}
			options.json[animationName].directions[angle].push(options.row * maxSize + options.column);

			options.column++;
			if(options.column >= maxSize) {
				options.column = 0;
				options.row++;

				if(options.row >= maxSize) {
					options.zip.file(`${options.modelName}_${options.sheet}.png`, options.canvas.toDataURL('image/png').replace('data:image/png;base64,', ''), { base64: true });

					options.row = 0;
					let canvas = document.createElement('canvas');
					canvas.width = this.sheetSize;
					canvas.height = this.sheetSize;
					options.canvas = canvas;
					options.ctx = canvas.getContext('2d');
					options.sheet++;
				}
			}
		},
		getPNGDataUrl() {
			return this.renderer.domElement.toDataURL('image/png');
		},

		onWindowResize() {
			let size = Math.min(window.innerWidth, window.innerHeight);
			let scale = Math.floor(size / this.frameSize);

			this.renderer.domElement.style.transform = `scale(${scale})`;
		},

		addAnimation(name, action, frames = 4) {
			this.animationActions[name] = {
				frames,
				action
			};
		},
		updateAngle(angleName) {
			let angles = this.angles[angleName];
			this.camera.position.set(...angles);
		},

		async loadModelFromUrls(urls) {
			let blobs = [];
			for(let i = 0; i < urls.length; i++) {
				const url = urls[i];
				let response = await axios.get(url, {
					responseType: 'blob'
				});

				blobs.push({
					name: url.split('/').at(-1).toLowerCase(),
					blob: response.data
				});
			}

			this.loadModelFromFiles(blobs);
		},
		async loadModelFromFiles(blobs) {
			if(this.currentModel) {
				this.scene.remove(this.currentModel);
				this.currentModel = null;
			}

			this.modelReady = false;
			const manager = new LoadingManager();
			manager.addHandler( /\.tga$/i, new TGALoader(manager) );
			const fbxLoader = new FBXLoader(manager);

			let modelBlobSet = blobs.find(({name}) => name.includes('.fbx') && !name.includes('@'));
			let modelBlob = modelBlobSet.blob;
			let modelName = modelBlobSet.name;
			modelBlob = await this.fixModelData(modelBlob);
			let textureBlob = blobs.find(({name}) => name.includes('.tga')).blob;
			manager.setURLModifier((url) => {
				let matchingBlob = blobs.find(({name}) => name.includes(url));

				if(modelName.includes(url)) {
					return URL.createObjectURL(modelBlob);
				} else if(matchingBlob) {
					return URL.createObjectURL(matchingBlob.blob);
				} else if(url.includes('.tga') && textureBlob) {
					return URL.createObjectURL(textureBlob);
				} else {
					return url;
				}
			});

			const animations = {};
			const recordAnimations = {};

			let model = this.currentModel = await fbxLoadPromise(fbxLoader, modelName);
			model.scale.set(0.01, 0.01, 0.01);
			this.mixer = new THREE.AnimationMixer(model);

			this.scene.add(model);
			if(this.modelFolder) {
				while(this.modelFolder.__controllers.length) {
					this.modelFolder.remove(this.modelFolder.__controllers[0]);
				}
			} else {
				this.modelFolder = this.gui.addFolder('Model');
			}
			this.modelFolder.add(model.position, 'x', -4, 4).step(0.1).listen();
			this.modelFolder.add(model.position, 'y', -4, 4).step(0.1).listen();
			this.modelFolder.add(model.position, 'z', -4, 4).step(0.1).listen();

			while(this.animationsFolder.__controllers.length) {
				this.animationsFolder.remove(this.animationsFolder.__controllers[0]);
			}
			while(this.actionsFolder.__controllers.length > 3) {
				this.actionsFolder.remove(this.actionsFolder.__controllers.at(-1));
			}

			let animationBlobs = blobs.filter(({name}) => name.includes('@') && name.includes('.fbx'));
			for(let i = 0; i < animationBlobs.length; i++) {
				let { name } = animationBlobs[i];
				let animationName = name.substring(name.indexOf('@') + 1, name.lastIndexOf('.fbx'));
				let animationObject = await fbxLoadPromise(fbxLoader, name);
				let animationAction = this.mixer.clipAction(animationObject.animations[0]);

				// Add actions to folders
				animations[animationName] = () => {
					this.setAction(animationAction);
				};
				this.animationsFolder.add(animations, animationName);

				recordAnimations[animationName] = () => {
					this.recordAnimation(animationAction, animationName);
				};
				this.actionsFolder.add(recordAnimations, animationName);

				let frames = this.recordParams.Frames;
				if(animationName === 'idle') {
					frames = 1;
				} else if(animationName === 'attack') {
					frames = 8;
				}

				this.addAnimation(animationName, animationAction, frames);
			}

			this.modelReady = true;
			if(this.animationActions.idle) {
				this.setAction(this.animationActions.idle.action);
			} else if(Object.values(this.animationActions).length > 0) {
				this.setAction(Object.values(this.animationActions)[0].action);
			}
		},
		async fixModelData(startBlob) {
			let arrayBuffer = await startBlob.arrayBuffer();
			let modelArray = new Uint8Array(arrayBuffer);

			let matchCount = 0;
			const psdSearchCodes = ['.', 'p', 's', 'd'].map(char => char.charCodeAt(0));
			const tgaReplaceCodes = ['.', 't', 'g', 'a'].map(char => char.charCodeAt(0));
			for(let i = 0; i < modelArray.length; i++) {
				let matches = true;
				for(let j = 0; j < psdSearchCodes.length; j++) {
					if(modelArray[i + j] !== psdSearchCodes[j]) {
						matches = false;
						break;
					}
				}

				if(matches) {
					matchCount++;

					for(let j = 0; j < psdSearchCodes.length; j++) {
						modelArray[i + j] = tgaReplaceCodes[j];
					}
				}
			}
			if(matchCount > 0) {
				console.warn(`Fixed: replaced .psd with .tga ${matchCount} times`);
			}

			return new Blob([arrayBuffer]);
		},
		droppedFiles(event) {
			let files = [...event.dataTransfer.files];
			let modelFile = files.find(file => file.name.toLowerCase().includes('.fbx') && !file.name.includes('@'));
			let textureFile = files.find(file => file.name.toLowerCase().includes('.tga'));
			if(!modelFile || !textureFile) {
				alert('You need to upload at least a fbx and a texture file');
				return;
			}

			this.loadModelFromFiles(files.map(file => {
				return {
					blob: file,
					name: file.name.toLowerCase()
				};
			}));
		}
	},
	mounted() {
		const scene = this.scene = new THREE.Scene();
		// scene.add(new THREE.AxesHelper(5))

		const light1  = new THREE.AmbientLight(0xFFFFFF, 0.3);
		light1.name = 'ambient_light';
		scene.add(light1);

		const light2  = new THREE.DirectionalLight(0xFFFFFF, 0.8 * Math.PI);
		light2.position.set(0.5, 0, 0.866); // ~60º
		light2.name = 'main_light';
		scene.add(light2);

		const hemiLight = new THREE.HemisphereLight();
		hemiLight.name = 'hemi_light';
		scene.add(hemiLight);

		const camera = this.camera = new THREE.PerspectiveCamera(
			75,
			1,
			0.01,
			1000
		);
		camera.position.set(...Object.values(this.angles)[0]);
		// camera.rotation.set won't work due - need to use controls.target.set when using OrbitControls for mouse handlers

		const renderer = this.renderer = new THREE.WebGLRenderer({
			// So we can save canvas to a PNG
			preserveDrawingBuffer: true,
			alpha: true
		});

		renderer.setSize(this.frameSize, this.frameSize);
		renderer.gammaOutput = true;

		this.$el.appendChild(renderer.domElement);

		// Gives mouse movement/rotation/zoom handlers
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		// controls.autoRotate = true;
		controls.target.set(0, 0, 0);

		// this.loadModel();
		this.loadModelFromUrls([
			'models/ToonRTS_demo_Knight/model.fbx',
			// 'models/archer/WK_SM_Archer_A.FBX',
			'models/ToonRTS_demo_Knight/DemoTexture.tga',
			// 'models/archer/WK_Standard_Units.tga',
			'models/ToonRTS_demo_Knight/model@idle.fbx',
			'models/ToonRTS_demo_Knight/model@run.fbx',
			'models/ToonRTS_demo_Knight/model@attack.fbx'
		]);

		window.addEventListener('resize', this.onWindowResize, false);
		this.onWindowResize();

		const stats = Stats();
		// this.$el.appendChild(stats.dom);

		const gui = this.gui = new GUI();
		this.animationsFolder = gui.addFolder('Animations');
		// animationsFolder.open();

		const cameraFolder = gui.addFolder('Camera');
		cameraFolder.add(camera.position, 'x', -4, 4).name('Position x').step(0.01).listen();
		cameraFolder.add(camera.position, 'y', -4, 4).name('Position y').step(0.01).listen();
		cameraFolder.add(camera.position, 'z', -4, 4).name('Position z').step(0.01).listen();
		cameraFolder.add(camera, 'fov', -100,100).step(1).listen();
		cameraFolder.add(camera, 'near', -100,100).step(1).listen();
		cameraFolder.add(camera, 'far', -100,100).step(1).listen();
		cameraFolder.add(camera, 'aspect', -100,100).step(1).listen();
		cameraFolder.add(camera, 'zoom', -100,100).step(0.1).listen();
		cameraFolder.add(camera.rotation, 'x', -4, 4).name('Rotation x').step(0.01).listen();
		cameraFolder.add(camera.rotation, 'y', -4, 4).name('Rotation y').step(0.01).listen();
		cameraFolder.add(camera.rotation, 'z', -4, 4).name('Rotation z').step(0.01).listen();
		// cameraFolder.open();

		const anglesFolder = gui.addFolder('Angles');
		let angleUpdater = {};

		let angleNames = Object.keys(this.angles);
		angleNames.sort((a, b) => {
			return parseInt(a) - parseInt(b);
		});
		angleNames.forEach((angleName) => {
			angleUpdater[angleName] = () => {
				this.updateAngle(angleName);
			};
			anglesFolder.add(angleUpdater, angleName);
		});

		this.actionsFolder = gui.addFolder('Actions');
		this.actionsFolder.add({
			'Save As Frames': () => {
				this.recordAllAsFrames('Footman');
			}
		}, 'Save As Frames');
		this.actionsFolder.add({
			'Save As Sheets': () => {
				this.recordAllAsSheets('Footman');
			}
		}, 'Save As Sheets');
		this.actionsFolder.add(this.recordParams, 'Frames', 0, 20).step(1).listen();
		this.actionsFolder.open();

		const clock = new THREE.Clock();

		const animate = () => {
			requestAnimationFrame(animate);

			controls.update();

			if(this.modelReady) this.mixer.update(clock.getDelta());

			render();

			stats.update();
		};

		function render() {
			renderer.render(scene, camera);
		}

		animate();
	},
	destroyed() {
		this.gui.destroy();
	}
};

function raf() {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			resolve();
		});
	});
}

function fbxLoadPromise(fbxLoader, url) {
	return new Promise((resolve, reject) => {
		fbxLoader.load(url, (object) => {
			resolve(object);
		}, (xhr) => {

		}, (error) => {
			console.error(error);
			reject(error);
		});
	});
}
</script>

<style>
html, body, #app {
	margin: 0;
	padding: 0;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

body {
	background: black;
}
#app > canvas {
	background: white;

	transform-origin: top left;
}
</style>
