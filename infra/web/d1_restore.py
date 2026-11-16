#!/usr/bin/env python3
"""Prepare a D1 SQL export for import into a new, empty D1 database.

This only orders a known subset of D1's export format. It is not a snapshot
coordinator and does not make D1 and R2 consistent with each other.
"""
import argparse
import os
from pathlib import Path
import re
import sqlite3


def order_export(sql):
    statements = []
    start = 0
    for index, char in enumerate(sql):
        if char == ';' and sqlite3.complete_statement(sql[start:index + 1]):
            statements.append(sql[start:index + 1].strip())
            start = index + 1
    if sql[start:].strip():
        raise ValueError('Exportación SQL incompleta o no reconocida')
    tables, data, post = [], [], []
    for statement in statements:
        if re.fullmatch(r'PRAGMA\s+defer_foreign_keys\s*=\s*(?:TRUE|1)\s*;', statement, re.I):
            continue
        if re.match(r'^CREATE\s+TABLE\b', statement, re.I):
            tables.append(statement)
        elif re.match(r'^INSERT\s+INTO\b', statement, re.I) or re.fullmatch(r'DELETE\s+FROM\s+sqlite_sequence\s*;', statement, re.I):
            data.append(statement)
        elif re.match(r'^CREATE\s+(?:(?:UNIQUE\s+)?INDEX|TRIGGER|VIEW)\b', statement, re.I):
            post.append(statement)
        else:
            raise ValueError('Sentencia de exportación no reconocida: ' + statement[:80])
    if not tables:
        raise ValueError('La exportación no contiene tablas')
    return '\n'.join(['PRAGMA defer_foreign_keys=TRUE;', *tables, *data, *post, ''])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path, help='archivo nuevo; no se sobrescribe')
    args = parser.parse_args()
    ordered = order_export(args.source.read_text(encoding='utf-8'))
    fd = os.open(args.destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        output.write(ordered)


if __name__ == '__main__':
    main()
