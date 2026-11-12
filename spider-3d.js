const canvas = document.querySelector("#spider-canvas");

if (!canvas) {
  throw new Error("The spider canvas is missing from the page.");
}

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const startSpider = async () => {
    const [THREE, { FBXLoader }] = await Promise.all([
      import("three"),
      import("./assets/vendor/three/examples/jsm/loaders/FBXLoader.js")
    ]);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        powerPreference: "low-power"
      });
    } catch (error) {
      console.error("The interactive spider needs WebGL support.", error);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 9;
    scene.add(new THREE.AmbientLight(0xfff0d7, 2.2));

    const warmLight = new THREE.DirectionalLight(0xf7d281, 3.2);
    warmLight.position.set(-3, 5, 7);
    scene.add(warmLight);

    const coolLight = new THREE.DirectionalLight(0x1b729f, 2);
    coolLight.position.set(4, -2, 5);
    scene.add(coolLight);

    const spider = new THREE.Group();
    scene.add(spider);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const screenPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const destination = new THREE.Vector3();
    const pointer = { x: 0, y: 0, movedAt: -Infinity };
    const clock = new THREE.Clock();
    let mixer;
    let runningAction;
    let idleAction;
    let activeAction;
    let legBones = [];
    let lastFrameTime = 0;
    let elapsed = 0;
    let spiderReady = false;

    const resize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };

    const rememberPointer = (event) => {
      const margin = Math.min(96, Math.max(60, Math.min(window.innerWidth, window.innerHeight) * 0.15));
      pointer.x = THREE.MathUtils.clamp(event.clientX, margin, window.innerWidth - margin);
      pointer.y = THREE.MathUtils.clamp(event.clientY, margin, window.innerHeight - margin);
      pointer.movedAt = performance.now();
    };

    const getAutopilotPosition = (time) => {
      const margin = Math.min(96, Math.max(60, Math.min(window.innerWidth, window.innerHeight) * 0.15));
      const width = Math.max(1, window.innerWidth - margin * 2);
      const height = Math.max(1, window.innerHeight - margin * 2);
      const perimeter = 2 * (width + height);
      const distance = (time * 112 + window.scrollY * 0.8) % perimeter;

      if (distance < width) {
        return { x: margin + distance, y: margin };
      }
      if (distance < width + height) {
        return { x: window.innerWidth - margin, y: margin + distance - width };
      }
      if (distance < width * 2 + height) {
        return { x: window.innerWidth - margin - (distance - width - height), y: window.innerHeight - margin };
      }
      return { x: margin, y: window.innerHeight - margin - (distance - width * 2 - height) };
    };

    const screenToWorld = (x, y, target) => {
      pointerNdc.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);
      raycaster.setFromCamera(pointerNdc, camera);
      return raycaster.ray.intersectPlane(screenPlane, target);
    };

    const animate = (time) => {
      window.requestAnimationFrame(animate);
      if (document.hidden || time - lastFrameTime < 1000 / 30) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      lastFrameTime = time;

      const pointerIsActive = performance.now() - pointer.movedAt < 1200;
      const screenTarget = pointerIsActive
        ? pointer
        : getAutopilotPosition(elapsed);

      if (screenToWorld(screenTarget.x, screenTarget.y, destination)) {
        if (!spiderReady) {
          spider.position.copy(destination);
          spiderReady = true;
        } else {
          spider.position.lerp(destination, 1 - Math.exp(-5.5 * delta));
        }

        const direction = destination.clone().sub(spider.position);
        if (direction.lengthSq() > 0.0001) {
          spider.rotation.z = Math.atan2(direction.y, direction.x) - Math.PI / 2;
        }
      }

      const isMoving = destination.distanceToSquared(spider.position) > 0.003;
      const desiredAction = isMoving ? runningAction : idleAction || runningAction;
      if (desiredAction && desiredAction !== activeAction) {
        desiredAction.reset().play();
        if (activeAction) activeAction.crossFadeTo(desiredAction, 0.2, false);
        activeAction = desiredAction;
      }

      if (mixer) mixer.update(delta);
      else if (legBones.length) {
        legBones.forEach((bone, index) => {
          const phase = elapsed * 11 + index * Math.PI / 2;
          bone.rotation.x = bone.userData.restRotation.x + Math.sin(phase) * 0.2;
          bone.rotation.z = bone.userData.restRotation.z + Math.cos(phase) * 0.18;
        });
      }

      renderer.render(scene, camera);
    };

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", rememberPointer, { passive: true });
    window.addEventListener("pointerdown", rememberPointer, { passive: true });
    resize();
    window.requestAnimationFrame(animate);

    const loadingManager = new THREE.LoadingManager();
    loadingManager.setURLModifier((url) => (
      url.endsWith("/Spinnen_Bein_tex_COLOR_") ? `${url}.jpg` : url
    ));

    const loader = new FBXLoader(loadingManager);
    loader.setResourcePath("./assets/spider/textures/");
    loader.load(
      "./assets/spider/Spider.fbx",
      (model) => {
        const collisionMeshes = [];
        model.traverse((object) => {
          if (object.isMesh && object.name.toLowerCase() === "box") collisionMeshes.push(object);
        });
        collisionMeshes.forEach((object) => {
          object.visible = false;
        });

        const modelPlacement = new THREE.Group();
        modelPlacement.rotation.x = Math.PI / 2;
        modelPlacement.add(model);
        modelPlacement.updateMatrixWorld(true);

        const bounds = new THREE.Box3().setFromObject(modelPlacement);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z);
        if (!largestDimension) {
          console.error("The supplied spider model has no measurable geometry.");
          return;
        }

        const displaySize = window.innerWidth < 520 ? 0.62 : 0.82;
        const scale = displaySize / largestDimension;
        modelPlacement.scale.setScalar(scale);
        modelPlacement.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        model.traverse((object) => {
          if (object.isMesh) {
            object.frustumCulled = false;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              material.opacity = 1;
              material.transparent = false;
              if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
              material.needsUpdate = true;
            });
          }
          if (object.isBone) legBones.push(object);
        });

        spider.add(modelPlacement);
        const runClip = model.animations.find((clip) => /run_ani_vor|run_forward/i.test(clip.name))
          || model.animations.find((clip) => /run|walk_ani_vor|walk_forward|walk/i.test(clip.name));
        const waitingClip = model.animations.find((clip) => /warte_pose|idle|normal|stand/i.test(clip.name));
        if (runClip || waitingClip) {
          mixer = new THREE.AnimationMixer(model);
          runningAction = runClip ? mixer.clipAction(runClip) : null;
          idleAction = waitingClip ? mixer.clipAction(waitingClip) : runningAction;
          legBones = [];
        } else {
          const namedLegBones = legBones.filter((bone) => /leg|bein|foot|femur|tars|coxa/i.test(bone.name));
          legBones = namedLegBones.length ? namedLegBones : legBones.slice(1);
          legBones.forEach((bone) => {
            bone.userData.restRotation = bone.rotation.clone();
          });
        }
      },
      undefined,
      (error) => console.error("Unable to load the supplied spider model.", error)
    );
  };

  startSpider().catch((error) => console.error("Unable to initialize the 3D spider.", error));
} else {
  canvas.remove();
}
