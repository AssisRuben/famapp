// Testes de chaveEquivalencia.js com nomes REAIS do catálogo (29/09/2026).
// Uso: node coletor/testar_chave_equivalencia.js
'use strict';

const assert = require('assert');
const { chaveEquivalencia } = require('./chaveEquivalencia');

const k = chaveEquivalencia;
let ok = 0;
const mesmo = (a, b) => {
  assert.ok(k(...a), `sem chave: ${a[0]}`);
  assert.strictEqual(k(...a), k(...b), `deviam ser equivalentes:\n  ${a[0]} -> ${k(...a)}\n  ${b[0]} -> ${k(...b)}`);
  ok++;
};
const diferente = (a, b) => {
  assert.notStrictEqual(k(...a), k(...b), `NÃO deviam ser equivalentes:\n  ${a[0]} -> ${k(...a)}\n  ${b[0]} -> ${k(...b)}`);
  ok++;
};
const semChave = (a) => {
  assert.strictEqual(k(...a), null, `devia ficar sem chave: ${a[0]} -> ${k(...a)}`);
  ok++;
};

// --- equivalentes: marca x genérico x similar, mesma apresentação ---
mesmo(['NOVALGINA 1G 10CP', 'DIPIRONA'], ['DIPIRONA 1G 10CP', 'dipirona ']);
mesmo(['NOVALGINA 500MG/ML GTS 20ML', 'DIPIRONA'], ['MAXALGINA 500MG/ML GTS 20ML', 'DIPIRONA']);
mesmo(['DIPIRONA 500MG ENV 10CP', 'DIPIRONA'], ['DORALEX 500MG ENV 10CP', 'DIPIRONA']);
mesmo(['CRESTOR 20MG 30CP REV', 'ROSUVASTATINA CALCICA'], ['ROSUVASTATINA 20MG 30CP REV', 'ROSUVASTATINA CALCICA']);
mesmo(['NOVAMOX 875MG+125MG 14CP REV', 'AMOXICILINA+CLAVULANATO DE POTASSIO'], ['AMOX+CLAV POT 875+125MG 14CP R', 'AMOXICILINA+CLAVULANATO DE POTASSIO']);
mesmo(['LUFTAL 75MG/ML CER GTS 15ML', 'SIMETICONA'], ['SIMETICONA 75MG/ML GTS 15ML', 'SIMETICONA']); // sabor não muda
mesmo(['DEPURA 7.000UI 8CAP MOLE', 'COLECALCIFEROL'], ['VITAMINA D3 7.000UI 8CAP GEL', 'COLECALCIFEROL']);
mesmo(['MICROVLAR 0,15MG+0,03MG 21DRG', 'LEVONORGESTREL+ETINILESTRADIOL'], ['GESTRELAN 0,15MG+0,03MG 21CP', 'LEVONORGESTREL+ETINILESTRADIOL']);
mesmo(['CATAFLAM 50MG 20DRG', 'DICLOFENACO POTASSICO'], ['DICLOFENACO POT 50MG 20CP REV', 'DICLOFENACO POTASSICO']);

// --- NÃO equivalentes ---
diferente(['DIPIRONA 1G 10CP', 'DIPIRONA'], ['DIPIRONA 1G 4CP', 'DIPIRONA']); // caixa diferente
diferente(['DIPIRONA 1G 10CP', 'DIPIRONA'], ['DIPIRONA 500MG 10CP', 'DIPIRONA']); // dose diferente
diferente(['DIPIRONA 500MG/ML GTS 20ML', 'DIPIRONA'], ['DIPIRONA 50MG/ML LIQ 100ML', 'DIPIRONA']); // forma
diferente(['NOVALGINA 1G 10CP', 'DIPIRONA'], ['DORFLEX UNO 1G 10CP EFEV', 'DIPIRONA']); // efervescente (com erro de digitação)
diferente(['DICLOFENACO POT 50MG 20CP REV', 'DICLOFENACO POTASSICO'], ['BIOFENAC DI 50MG 20CP DISP', 'DICLOFENACO POTASSICO']); // dispersível
diferente(['LUFTAL 75MG/ML GTS INF 15ML', 'SIMETICONA'], ['SIMETICONA 75MG/ML GTS 15ML', 'SIMETICONA']); // infantil
diferente(['PISA 0,375MG 30CP L.P', 'DICLORIDRATO DE PRAMIPEXOL'], ['PRAMIPEXOL 0,375MG 30CP', 'DICLORIDRATO DE PRAMIPEXOL']); // liberação prolongada

// --- números: milhar x decimal ---
assert.ok(k('ADDERA D3 3.300UI/ML GTS 10ML', 'COLECALCIFEROL').includes('|3300UI/ML|'));
assert.ok(k('PRAMIPEXOL 0,375MG 30CP', 'X').includes('|0.375MG|'));
ok += 2;

// --- sem chave (sem princípio ativo ou sem dose legível): nunca palpite ---
semChave(['DES DOVE AER ORIG 150ML', null]);
semChave(['DORILAX DT 12CP', 'PARACETAMOL+CAFEINA+CITRATO DE ORFENADRINA']); // sem dose no nome
semChave(['NOVALGINA 1G 10CP', '   ']);

// --- a cópia dentro do nó do n8n é idêntica ao módulo ---
const fs = require('fs');
const modulo = fs.readFileSync(__dirname + '/chaveEquivalencia.js', 'utf8');
const corpoModulo = modulo.slice(modulo.indexOf('const NUM'), modulo.indexOf('module.exports')).trimEnd();
const no = JSON.parse(fs.readFileSync(__dirname + '/sgf-produto-diario.n8n.json', 'utf8')).nodes.find(
  (n) => n.name === 'Mapear produtos (lotes de 500)'
);
const codigoNo = no.parameters.jsCode;
const corpoNo = codigoNo.slice(codigoNo.indexOf('const NUM'), codigoNo.indexOf('// </chaveEquivalencia>')).trimEnd();
assert.strictEqual(corpoNo, corpoModulo, 'nó "Mapear produtos" do n8n está com cópia DESATUALIZADA de chaveEquivalencia.js');
ok++;

// --- o nó do n8n roda e grava as duas colunas novas ---
const $input = {
  all: () => [
    {
      json: [
        { codigo: 1, nome: 'NOVALGINA 1G 10CP', nomePrincipioAtivo: 'dipirona', quantidadeEstoque: 5 },
        { codigo: 2, nome: "SAB O'BOTICARIO 90G", nomePrincipioAtivo: '' },
      ],
    },
  ],
};
const saida = new Function('$input', codigoNo)($input);
const sql = saida[0].json.sql;
assert.ok(sql.includes("'DIPIRONA', 'DIPIRONA|1G|CP||10')"), sql);
assert.ok(sql.includes('NULL, NULL)'), sql);
ok++;

console.log(`chaveEquivalencia: ${ok} verificações OK`);
