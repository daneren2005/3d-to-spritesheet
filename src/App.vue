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

export default {
	data: () => ({
		gui: null
	}),
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

		const camera = new THREE.PerspectiveCamera(
			75,
			1,
			0.01,
			1000
		);
		camera.position.set(0, 1.05, 0.32);
		// camera.rotation.set won't work due - need to use controls.target.set when using OrbitControls for mouse handlers

		const renderer = new THREE.WebGLRenderer({
			// So we can save canvas to a PNG
			preserveDrawingBuffer: true,
			alpha: true
		});

		let size = Math.min(window.innerWidth, window.innerHeight);
		renderer.setSize(size, size);
		renderer.gammaOutput = true;

		this.$el.appendChild(renderer.domElement);

		// Gives mouse movement/rotation/zoom handlers
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.target.set(0, 0, 0);

		const manager = new LoadingManager();
		manager.addHandler( /\.tga$/i, new TGALoader() );

		let mixer;
		let modelReady = false;
		const animationActions = [];
		let activeAction;
		let lastAction;
		const fbxLoader = new FBXLoader(manager);

		fbxLoader.load(
			'models/ToonRTS_demo_Knight/model.fbx',
			(object) => {
				object.scale.set(0.01, 0.01, 0.01);
				object.position.set(0, 0, 0);
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

						//add an animation from another file
						fbxLoader.load(
							'models/ToonRTS_demo_Knight/model@walk.fbx',
							(object) => {
								const animationAction = mixer.clipAction(
									object.animations[0]
								);
								animationActions.push(animationAction);
								animationsFolder.add(animations, 'walk');
								activeAction = animationAction;

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

										fbxLoader.load(
											'models/ToonRTS_demo_Knight/model@attack.fbx',
											(object) => {
												//console.dir((object as THREE.Object3D).animations[0])
												const animationAction = mixer.clipAction(
													object.animations[0]
												);
												console.log('animation: ', animationAction);
												animationActions.push(animationAction);
												animationsFolder.add(animations, 'attack');

												modelReady = true;
												setAction(animationActions[0]);
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

		window.addEventListener('resize', onWindowResize, false);
		function onWindowResize() {
			camera.updateProjectionMatrix();

			/*let newSize = Math.min(window.innerWidth, window.innerHeight);
			renderer.setSize(newSize);*/
			render();
		}

		const stats = Stats();
		this.$el.appendChild(stats.dom);

		const animations = {
			idle: function () {
				setAction(animationActions[0]);
			},
			walk: function () {
				setAction(animationActions[1]);
			},
			run: function () {
				setAction(animationActions[2]);
			},
			attack: function () {
				setAction(animationActions[3]);
			}
		};

		const setAction = (toAction) => {
			if (toAction != activeAction) {
				lastAction = activeAction;
				activeAction = toAction;
				//lastAction.stop()
				lastAction.fadeOut(1);
				activeAction.reset();
				activeAction.fadeIn(1);
				activeAction.play();
			}
		};

		const gui = this.gui = new GUI();
		const animationsFolder = gui.addFolder('Animations');

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
		cameraFolder.open();

		const actionsFolder = gui.addFolder('Actions');
		actionsFolder.add({
			'Save to PNG': () => {
				let a = document.createElement('a');
				let imgData = renderer.domElement.toDataURL();
				a.href = imgData.replace('image/png', 'image/octet-stream');
				a.download = 'canvas.png';
				a.click();
			}
		}, 'Save to PNG');


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
}
</style>
