<template>
	<div id="app">
		
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
			modelReady: false,
			renderer: null,
			camera: null,
			gui: null,
			scene: null,
			mixer: null,
			activeAction: null,
			animationActions: {},
			animationsFolder: null,
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
				lastAction.stop();
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

		async loadModel() {
			this.modelReady = false;
			const manager = new LoadingManager();
			manager.addHandler( /\.tga$/i, new TGALoader(manager) );
			const fbxLoader = new FBXLoader(manager);

			let blobs = {};
			manager.setURLModifier((url) => {
				if(blobs[url]) {
					return URL.createObjectURL(blobs[url]);
				} else {
					return url;
				}
			});

			// TODO: Refactor these to be dynamic based on what is loaded
			const animations = {
				idle: () => {
					this.setAction(this.animationActions.base.action);
				},
				walk: () => {
					this.setAction(this.animationActions.walk.action);
				},
				attack: () => {
					this.setAction(this.animationActions.attack.action);
				}
			};
			const recordAnimations = {
				idle: () => {
					this.recordAnimation(this.animationActions.base.action, 'Idle');
				},
				walk: () => {
					this.recordAnimation(this.animationActions.walk.action, 'Walk');
				},
				attack: () => {
					this.recordAnimation(this.animationActions.attack.action, 'Attack');
				}
			};

			// models/archer/WK_SM_Archer_A.FBX
			let modelResponse = await axios.get('models/ToonRTS_demo_Knight/model.fbx', {
				responseType: 'blob'
			});
			blobs['model.fbx'] = modelResponse.data;
			let textureResponse = await axios.get('models/ToonRTS_demo_Knight/DemoTexture.tga', {
				responseType: 'blob'
			});
			blobs['./DemoTexture.tga'] = textureResponse.data;

			let model = await fbxLoadPromise(fbxLoader, 'model.fbx');
			model.scale.set(0.01, 0.01, 0.01);
			this.mixer = new THREE.AnimationMixer(model);

			this.scene.add(model);
			let modelFolder = this.gui.addFolder('Model');
			modelFolder.add(model.position, 'x', -4, 4).step(0.1).listen();
			modelFolder.add(model.position, 'y', -4, 4).step(0.1).listen();
			modelFolder.add(model.position, 'z', -4, 4).step(0.1).listen();


			let idleAnimation = await fbxLoadPromise(fbxLoader, 'models/ToonRTS_demo_Knight/model@idle.fbx');
			const idleAction = this.mixer.clipAction(
				idleAnimation.animations[0]
			);
			this.animationsFolder.add(animations, 'idle');
			this.actionsFolder.add(recordAnimations, 'idle');
			this.addAnimation('base', idleAction, 1);


			let runAnimation = await fbxLoadPromise(fbxLoader, 'models/ToonRTS_demo_Knight/model@run.fbx');
			const runAction = this.mixer.clipAction(
				runAnimation.animations[0]
			);
			this.animationsFolder.add(animations, 'walk');
			this.actionsFolder.add(recordAnimations, 'walk');
			this.addAnimation('walk', runAction);
			this.activeAction = runAction;


			let attackAnimation = await fbxLoadPromise(fbxLoader, 'models/ToonRTS_demo_Knight/model@attack.fbx');
			const attackAction = this.mixer.clipAction(
				attackAnimation.animations[0]
			);
			this.animationsFolder.add(animations, 'attack');
			this.actionsFolder.add(recordAnimations, 'attack');
			this.addAnimation('attack', attackAction, 8);

			this.modelReady = true;
			this.setAction(this.animationActions.base.action);
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

		this.loadModel();

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
