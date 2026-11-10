"""Independent runtime proof: scipy matrix exponential vs shipped JS; no formula copied."""
import itertools, json, subprocess
from pathlib import Path
import numpy as np
from scipy.linalg import expm
root = Path(__file__).resolve().parents[1]
refs = json.loads((root / 'tests/refs/motion_freedecay.json').read_text())
for q in refs:
    w = 2*np.pi*q['fn_hz']
    state = expm(np.array([[0,1],[-w*w,-2*q['zeta']*w]])*q['t_s']) @ [q['x0_m'],q['v0_mps']]
    np.testing.assert_allclose(state,[q['x_m'],q['v_mps']],rtol=1e-10,atol=1e-13)
rows = []
for fn,zeta,(x0,v0),cycles in itertools.product([.1,2,50], [0,1e-8,.05,.5,1-1e-9,1,1+1e-9,2,20], [(10,0),(-4,300),(0,-8)], [0,.013,.1,1,5]):
    t=cycles/fn; w=2*np.pi*fn
    truth = expm(np.array([[0,1],[-w*w,-2*zeta*w]])*t) @ [x0,v0]
    rows.append({'args':[t,x0,v0,fn,zeta], 'ref':truth.tolist()})
script="import {freeDecay} from './docs/calcs.js'; let s=''; for await (const c of process.stdin) s+=c; console.log(JSON.stringify(JSON.parse(s).map(q=>Object.values(freeDecay(...q.args)))));"
got=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(rows).encode(),cwd=root))
worst=0
for q,result in zip(rows,got):
    err=np.abs(np.array(result)-q['ref'])/np.maximum(1,np.abs(q['ref']))
    worst=max(worst,float(max(err)))
    assert max(err)<=1e-6,(q,result,err)
print(f"PASS: {len(refs)} existing scipy rows independently recomputed; {len(rows)} JS/scipy cases, x and v in mm and mm/s; max scaled error {worst:.3g}, limit 1e-6")
print('Includes zero damping, near-critical limits, critical/overdamping, three initial states, and t=0.')
