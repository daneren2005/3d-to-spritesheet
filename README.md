# Convert FBX 3D models to 2D spritesheets
Convert FBX 3D models to 9-directional 2D spritesheets.  Only tested with a few FBX models, so others will probably need additional work.  Works by dragging a group of files onto the page to load a new model.  You need to include the base model, texture, and any animations to be rendered.  The animation models need to be named `model@animation.fbx` in order to work correctly.  You can also include a `config.json` with details about which files are being added and how many frames are rendered per animation:

```
{
	"model": "model.FBX",
	"texture": "DemoTexture.tga",
	"animations": {
		"idle": {
			"name": "model@idle.FBX",
			"frames": 1
		},
		"run": {
			"name": "model@run.FBX"
		},
		"attack": {
			"name": "model@attack.FBX",
			"frames": 8
		}
	}
}
```

You can view each of the loaded animations from the animations tab.  You can generate individual animation frames or an entire spritesheet all at once for all animations from the Actions tab.  Defaults to 4 frames per animation and 256px frames on a 4096px sheet.  These options can be configured in the Frames tab.

View at https://daneren2005.github.io/3d-to-spritesheet/.

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm start
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```



### Notes
* Basic 3d model preview with https://3dviewer.net/