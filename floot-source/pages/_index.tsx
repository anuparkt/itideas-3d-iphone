import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { Box, Camera, Crosshair, FileUp, Focus, Grid3X3, Image, Maximize2, RotateCcw, Ruler, ScanLine, Triangle, View } from "lucide-react";
import { Button } from "../components/Button";
import { Toggle } from "../components/Toggle";
import { Input } from "../components/Input";
import styles from "./_index.module.css";

type RenderMode = "solid" | "edges" | "wireframe";
type Vec3 = { x: number; y: number; z: number };

type ViewerApi = {
  fit: () => void;
  setView: (name: string) => void;
  setMode: (mode: RenderMode) => void;
  setGrid: (show: boolean) => void;
  setAxes: (show: boolean) => void;
  capture: () => void;
  clearMeasure: () => void;
};

const fmt = (n: number) => Number.isFinite(n) ? n.toFixed(n >= 100 ? 1 : 2) : "—";

export default function IndexPage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const meshRootRef = useRef<THREE.Object3D | null>(null);
  const [fileName, setFileName] = useState("Demo calibration block");
  const [fileMeta, setFileMeta] = useState("Built-in sample • mm");
  const [dims, setDims] = useState<Vec3>({ x: 80, y: 50, z: 20 });
  const [triangles, setTriangles] = useState(12);
  const [status, setStatus] = useState("READY");
  const [mode, setMode] = useState<RenderMode>("solid");
  const [gridOn, setGridOn] = useState(true);
  const [axesOn, setAxesOn] = useState(true);
  const [measureOn, setMeasureOn] = useState(false);
  const [measurement, setMeasurement] = useState<number | null>(null);
  const [message, setMessage] = useState("Drag to orbit • Pinch to zoom • Two-finger drag to pan");

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b0f);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
    camera.position.set(120, 95, 120);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    const ambient = new THREE.HemisphereLight(0xc8f7ff, 0x1a2328, 1.65);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(90, 130, 80);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x35d5f2, 1.3);
    rim.position.set(-80, 45, -90);
    scene.add(rim);

    const grid = new THREE.GridHelper(600, 30, 0x2c7480, 0x18262d);
    scene.add(grid);
    const axes = new THREE.AxesHelper(70);
    scene.add(axes);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    meshRootRef.current = modelGroup;

    const measurementGroup = new THREE.Group();
    scene.add(measurementGroup);

    const makeDemo = () => {
      const g = new THREE.BoxGeometry(80, 20, 50);
      const m = new THREE.MeshStandardMaterial({ color: 0x7a919b, roughness: 0.42, metalness: 0.12 });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.y = 10;
      modelGroup.add(mesh);
    };
    makeDemo();

    const getBounds = () => new THREE.Box3().setFromObject(modelGroup);
    const fit = () => {
      const box = getBounds();
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const dist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.7;
      const dir = new THREE.Vector3(1, 0.82, 1).normalize();
      camera.position.copy(center).add(dir.multiplyScalar(dist));
      controls.target.copy(center);
      controls.update();
      camera.near = Math.max(dist / 1000, 0.01);
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
    };

    const setView = (name: string) => {
      const box = getBounds();
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const d = Math.max(size.x, size.y, size.z, 10) * 2.3;
      const map: Record<string, THREE.Vector3> = {
        ISO: new THREE.Vector3(1, 0.8, 1),
        FRONT: new THREE.Vector3(0, 0, 1),
        BACK: new THREE.Vector3(0, 0, -1),
        LEFT: new THREE.Vector3(-1, 0, 0),
        RIGHT: new THREE.Vector3(1, 0, 0),
        TOP: new THREE.Vector3(0, 1, 0),
        BOTTOM: new THREE.Vector3(0, -1, 0),
      };
      const dir = (map[name] || map.ISO).clone().normalize();
      camera.position.copy(center).add(dir.multiplyScalar(d));
      camera.up.set(0, 1, 0);
      if (name === "TOP" || name === "BOTTOM") camera.up.set(0, 0, -1);
      controls.target.copy(center);
      camera.lookAt(center);
      controls.update();
    };

    const setModeFn = (next: RenderMode) => {
      const edgeObjects: THREE.Object3D[] = [];
      modelGroup.traverse((obj) => {
        if (obj.userData.itideasEdges) edgeObjects.push(obj);
      });
      edgeObjects.forEach((obj) => obj.parent?.remove(obj));
      modelGroup.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const material = obj.material as THREE.MeshStandardMaterial;
        if (next === "wireframe") {
          material.wireframe = true;
          material.transparent = false;
          material.opacity = 1;
        } else {
          material.wireframe = false;
          material.transparent = false;
          material.opacity = 1;
        }
        if (next === "edges" && obj.geometry) {
          const lines = new THREE.LineSegments(
            new THREE.EdgesGeometry(obj.geometry, 18),
            new THREE.LineBasicMaterial({ color: 0x35d5f2, transparent: true, opacity: 0.8 })
          );
          lines.userData.itideasEdges = true;
          obj.add(lines);
        }
      });
    };

    const capture = () => {
      renderer.render(scene, camera);
      const a = document.createElement("a");
      a.href = renderer.domElement.toDataURL("image/png");
      a.download = `itideas-3d-${Date.now()}.png`;
      a.click();
    };

    const clearMeasure = () => {
      measurementGroup.clear();
      measurePoints = [];
      setMeasurement(null);
    };

    apiRef.current = {
      fit,
      setView,
      setMode: setModeFn,
      setGrid: (show) => { grid.visible = show; },
      setAxes: (show) => { axes.visible = show; },
      capture,
      clearMeasure,
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let measurePoints: THREE.Vector3[] = [];
    const handlePointer = (event: PointerEvent) => {
      if (!measureOn) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(modelGroup, true).filter((h) => h.object instanceof THREE.Mesh);
      if (!hits.length) return;
      const p = hits[0].point.clone();
      if (measurePoints.length >= 2) {
        measurementGroup.clear();
        measurePoints = [];
      }
      measurePoints.push(p);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(getBounds().getSize(new THREE.Vector3()).length() * 0.008, 0.6), 18, 18), new THREE.MeshBasicMaterial({ color: 0x35d5f2 }));
      dot.position.copy(p);
      measurementGroup.add(dot);
      if (measurePoints.length === 2) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(measurePoints);
        measurementGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x35d5f2 })));
        const dist = measurePoints[0].distanceTo(measurePoints[1]);
        setMeasurement(dist);
        setMessage(`Measured ${dist.toFixed(2)} mm`);
      }
    };
    renderer.domElement.addEventListener("pointerdown", handlePointer);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    fit();

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointer);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, [measureOn]);

  const updateStats = (root: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    setDims({ x: size.x, y: size.y, z: size.z });
    let count = 0;
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        const pos = obj.geometry.getAttribute("position");
        count += obj.geometry.index ? obj.geometry.index.count / 3 : pos ? pos.count / 3 : 0;
      }
    });
    setTriangles(Math.round(count));
  };

  const replaceModel = (object: THREE.Object3D) => {
    const root = meshRootRef.current;
    if (!root) return;
    root.clear();
    object.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = new THREE.MeshStandardMaterial({ color: 0x8097a2, roughness: 0.38, metalness: 0.08 });
      }
    });
    root.add(object);
    updateStats(root);
    apiRef.current?.setMode(mode);
    requestAnimationFrame(() => apiRef.current?.fit());
  };

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    setStatus("LOADING");
    setMessage(`Reading ${file.name}…`);
    setFileName(file.name);
    setFileMeta(`${(file.size / 1024 / 1024).toFixed(2)} MB • local file`);
    try {
      const buffer = await file.arrayBuffer();
      if (ext === "stl") {
        const geo = new STLLoader().parse(buffer);
        geo.computeVertexNormals();
        replaceModel(new THREE.Mesh(geo));
      } else if (ext === "3mf") {
        const group = new ThreeMFLoader().parse(buffer);
        replaceModel(group);
      } else if (ext === "step" || ext === "stp") {
        throw new Error("STEP/STP parser is the next module. STL and 3MF are active in this build.");
      } else {
        throw new Error("Unsupported file. Choose STL, 3MF, STEP or STP.");
      }
      setStatus("READY");
      setMessage("Model loaded locally • inspect dimensions before production");
    } catch (err) {
      setStatus("ERROR");
      setMessage(err instanceof Error ? err.message : "Could not read this model");
    }
  };

  const setRenderMode = (next: RenderMode) => {
    setMode(next);
    apiRef.current?.setMode(next);
  };

  return (
    <main className={styles.appShell}>
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <div className={styles.brandMark}><ScanLine size={20} /></div>
          <div>
            <div className={styles.brand}>ITIDEAS <span>3D</span></div>
            <div className={styles.subbrand}>INSPECTION VIEWER</div>
          </div>
        </div>
        <div className={`${styles.status} ${status === "ERROR" ? styles.statusError : ""}`}>
          <span />{status}
        </div>
      </header>

      <section className={styles.fileBar}>
        <div className={styles.fileInfo}>
          <div className={styles.fileName}>{fileName}</div>
          <div className={styles.fileMeta}>{fileMeta}</div>
        </div>
        <Input ref={fileRef} className={styles.hiddenInput} type="file" accept=".stl,.3mf,.step,.stp" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <Button size="sm" className={styles.openButton} onClick={() => fileRef.current?.click()}><FileUp size={16} /> Open</Button>
      </section>

      <section className={styles.viewportWrap}>
        <div ref={viewportRef} className={styles.viewport} />
        <div className={styles.viewBadge}>PERSPECTIVE</div>
        <div className={styles.dimensionHud}>
          <div><span>X</span><strong>{fmt(dims.x)}</strong><em>mm</em></div>
          <div><span>Y</span><strong>{fmt(dims.y)}</strong><em>mm</em></div>
          <div><span>Z</span><strong>{fmt(dims.z)}</strong><em>mm</em></div>
        </div>
        {measurement !== null && <div className={styles.measureHud}><Ruler size={15} /><span>{fmt(measurement)} mm</span></div>}
        <div className={styles.viewportTools}>
          <Button variant="secondary" size="icon-sm" onClick={() => apiRef.current?.fit()} aria-label="Fit"><Focus size={17} /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => apiRef.current?.setView("ISO")} aria-label="ISO"><Box size={17} /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => apiRef.current?.setView("TOP")} aria-label="Top"><Camera size={17} /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => { apiRef.current?.clearMeasure(); setMessage("Measurement cleared"); }} aria-label="Clear measure"><RotateCcw size={17} /></Button>
        </div>
      </section>

      <section className={styles.inspectionStrip}>
        <div className={styles.statBlock}>
          <span>TRIANGLES</span><strong>{triangles.toLocaleString()}</strong>
        </div>
        <div className={styles.statBlock}>
          <span>UNITS</span><strong>mm</strong>
        </div>
        <div className={styles.statBlock}>
          <span>VIEW</span><strong>ISO</strong>
        </div>
        <Button variant="outline" size="sm" onClick={() => apiRef.current?.capture()}><Image size={15} /> Capture</Button>
      </section>

      <section className={styles.toolPanel}>
        <div className={styles.panelTitle}>DISPLAY</div>
        <div className={styles.segmentRow}>
          {(["solid", "edges", "wireframe"] as RenderMode[]).map((item) => (
            <Button key={item} size="sm" variant={mode === item ? "primary" : "secondary"} onClick={() => setRenderMode(item)}>
              {item === "solid" ? <Box size={15}/> : item === "edges" ? <Triangle size={15}/> : <Grid3X3 size={15}/>} {item.toUpperCase()}
            </Button>
          ))}
        </div>

        <div className={styles.panelTitle}>STANDARD VIEWS</div>
        <div className={styles.viewGrid}>
          {["ISO", "FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM"].map((name) => (
            <Button key={name} variant="secondary" size="sm" onClick={() => apiRef.current?.setView(name)}>{name}</Button>
          ))}
        </div>

        <div className={styles.toggleRow}>
          <Toggle pressed={gridOn} onPressedChange={(v) => { setGridOn(v); apiRef.current?.setGrid(v); }}><Grid3X3 size={16}/> Grid</Toggle>
          <Toggle pressed={axesOn} onPressedChange={(v) => { setAxesOn(v); apiRef.current?.setAxes(v); }}><Crosshair size={16}/> XYZ</Toggle>
          <Toggle pressed={measureOn} onPressedChange={(v) => { setMeasureOn(v); setMessage(v ? "Tap two points on the model" : "Measurement mode off"); }}><Ruler size={16}/> Measure</Toggle>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.message}><View size={14}/>{message}</div>
        <div className={styles.workflow}>LOAD → FIT/ISO → XYZ → EDGES → MEASURE → CAPTURE</div>
      </footer>
    </main>
  );
}
