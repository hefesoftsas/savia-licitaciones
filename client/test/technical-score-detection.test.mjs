import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTechnicalScore,localizeOutlineMessage} from '../src/features/web/technical-score-detection.mjs';
test('detecta afirmaciones claras y deja lo ambiguo sin decidir',()=>{
 assert.equal(detectTechnicalScore('En los documentos vigentes no hay criterios técnicos de puntuación identificables con nombre, puntaje o peso.'),'none');
 assert.equal(detectTechnicalScore('El criterio técnico metodología se califica con 30 puntos.'),'present');
 assert.equal(detectTechnicalScore('Revisar los requisitos técnicos y el precio.'),'unknown');
 assert.equal(detectTechnicalScore('No hay criterios técnicos de puntuación. El criterio técnico metodología tiene 30 puntos.'),'unknown');
});
test('traduce el error y el nombre interno de los análisis guardados',()=>{
 assert.equal(localizeOutlineMessage('目录生成失败：Revise 技术评分信息.md','es'),'Falló la generación del índice: Revise análisis de criterios técnicos');
});
