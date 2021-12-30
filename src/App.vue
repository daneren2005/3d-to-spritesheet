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

const MAX_ANGLE = Math.PI / 8;

export default {
	data: () => {
		let angleCount = 16;
		let angles = {};
		for(let i = 0; i < angleCount; i++) {
			let angle = (360 / angleCount) * i;
			let radians = angle * Math.PI / 180;
			angles[angle] = [Math.sin(radians) * MAX_ANGLE, 1.05, Math.cos(radians) * MAX_ANGLE];
		}

		return {
			renderer: null,
			camera: null,
			gui: null,
			activeAction: null,
			animationActions: {},
			recordParams: {
				Frames: 10
			},
			frameSize: 256,
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

		async recordAll(name = 'test') {
			let angleNames = Object.keys(this.angles);
			angleNames.sort((a, b) => {
				return parseInt(a) - parseInt(b);
			});
			let animationNames = Object.keys(this.animationActions);

			let zip = new JSZip();
			for(let i = 0; i < angleNames.length; i++) {
				let angleName = angleNames[i];

				this.camera.position.set(...this.angles[angleName]);
				for(let j = 0; j < animationNames.length; j++) {
					let animationName = animationNames[j];
					let action = this.animationActions[animationName];

					console.log(`Generating ${animationName} animation at angle ${angleName}`);
					await this.generateFrameFromAnimation(zip, action, `${animationName} ${angleName} `);
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
		async recordAnimation(action, name = 'test') {
			let zip = new JSZip();
			await this.generateFrameFromAnimation(zip, action, name);

			zip.generateAsync({type: 'blob'}).then((content) => {
				saveAs(content, `${name}.zip`);
			});
		},

		async generateFrameFromAnimation(zip, action, frameName) {
			this.setAction(action);

			let duration = action._clip.duration;
			const FRAMES = this.recordParams.Frames;
			let skipTime = Math.floor(duration / FRAMES / 16.6 * 1000);

			await raf();
			for(let i = 0; i < FRAMES; i++) {
				zip.file(`${frameName} ${i + 1}.png`, this.getPNGDataUrl().replace('data:image/png;base64,', ''), { base64: true });

				for(let j = 0; j < skipTime; j++) {
					await raf();
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

		updateAngle(angleName) {
			let angles = this.angles[angleName];
			this.camera.position.set(...angles);
		}
	},
	mounted() {
		const scene = new THREE.Scene();
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

		const manager = new LoadingManager();
		manager.addHandler( /\.tga$/i, new TGALoader() );

		let mixer;
		let modelReady = false;
		const animationActions = [];
		const fbxLoader = new FBXLoader(manager);

		fbxLoader.load(
			'models/ToonRTS_demo_Knight/model.fbx',
			(object) => {
				object.scale.set(0.01, 0.01, 0.01);
				mixer = new THREE.AnimationMixer(object);

				// Model doesn't have any
				/*const animationAction = mixer.clipAction(
					object.animations[0]
				)
				animationActions.push(animationAction)
				animationsFolder.add(animations, 'default')
				activeAction = animationActions[0]*/

				scene.add(object);
				let modelFolder = gui.addFolder('Model');
				modelFolder.add(object.position, 'x', -4, 4).step(0.1).listen();
				modelFolder.add(object.position, 'y', -4, 4).step(0.1).listen();
				modelFolder.add(object.position, 'z', -4, 4).step(0.1).listen();

				//add an animation from another file
				fbxLoader.load(
					'models/ToonRTS_demo_Knight/model@idle.fbx',
					(object) => {
						const animationAction = mixer.clipAction(
							object.animations[0]
						);
						animationActions.push(animationAction);
						animationsFolder.add(animations, 'idle');
						actionsFolder.add(recordAnimations, 'idle');
						this.animationActions.idle = animationAction;

						//add an animation from another file
						fbxLoader.load(
							'models/ToonRTS_demo_Knight/model@walk.fbx',
							(object) => {
								const animationAction = mixer.clipAction(
									object.animations[0]
								);
								animationActions.push(animationAction);
								animationsFolder.add(animations, 'walk');
								// actionsFolder.add(recordAnimations, 'walk');
								// this.animationActions.walk = animationAction;
								this.activeAction = animationAction;

								//add an animation from another file
								fbxLoader.load(
									'models/ToonRTS_demo_Knight/model@run.fbx',
									(object) => {
										//console.dir((object as THREE.Object3D).animations[0])
										const animationAction = mixer.clipAction(
											object.animations[0]
										);
										animationActions.push(animationAction);
										animationsFolder.add(animations, 'run');
										actionsFolder.add(recordAnimations, 'run');
										this.animationActions.run = animationAction;

										fbxLoader.load(
											'models/ToonRTS_demo_Knight/model@attack.fbx',
											(object) => {
												//console.dir((object as THREE.Object3D).animations[0])
												const animationAction = mixer.clipAction(
													object.animations[0]
												);
												animationActions.push(animationAction);
												animationsFolder.add(animations, 'attack');
												actionsFolder.add(recordAnimations, 'attack');
												this.animationActions.attack = animationAction;

												modelReady = true;
												this.setAction(animationActions[0]);
											},
											(xhr) => {
												
											},
											(error) => {
												console.error(error);
											}
										);
									},
									(xhr) => {
										
									},
									(error) => {
										console.error(error);
									}
								);
							},
							(xhr) => {
								
							},
							(error) => {
								console.error(error);
							}
						);
					},
					(xhr) => {
						
					},
					(error) => {
						console.error(error);
					}
				);
			},
			(xhr) => {
				
			},
			(error) => {
				console.error(error);
			}
		);

		window.addEventListener('resize', this.onWindowResize, false);
		this.onWindowResize();

		const stats = Stats();
		// this.$el.appendChild(stats.dom);

		const animations = {
			idle: () => {
				this.setAction(animationActions[0]);
			},
			walk: () => {
				this.setAction(animationActions[1]);
			},
			run: () => {
				this.setAction(animationActions[2]);
			},
			attack: () => {
				this.setAction(animationActions[3]);
			}
		};
		const recordAnimations = {
			idle: () => {
				this.recordAnimation(animationActions[0], 'Idle');
			},
			/*walk: () => {
				this.recordAnimation(animationActions[1], 'Walk');
			},*/
			run: () => {
				this.recordAnimation(animationActions[2], 'Run');
			},
			attack: () => {
				this.recordAnimation(animationActions[3], 'Attack');
			}
		};

		const gui = this.gui = new GUI();
		const animationsFolder = gui.addFolder('Animations');
		animationsFolder.open();

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

		const actionsFolder = gui.addFolder('Actions');
		actionsFolder.add({
			'Save All': () => {
				this.recordAll('Footman');
			}
		}, 'Save All');
		actionsFolder.add(this.recordParams, 'Frames', 0, 20).step(1).listen();


		const clock = new THREE.Clock();

		function animate() {
			requestAnimationFrame(animate);

			controls.update();

			if (modelReady) mixer.update(clock.getDelta());

			render();

			stats.update();
		}

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
