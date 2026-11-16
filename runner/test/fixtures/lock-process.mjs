import {acquireRunnerLock} from '../../runner-lock.mjs';
try {const release=await acquireRunnerLock(process.argv[2]);process.stdout.write('acquired\n');process.stdin.resume();process.stdin.once('data',async()=>{await release();process.exit(0);});}
catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
