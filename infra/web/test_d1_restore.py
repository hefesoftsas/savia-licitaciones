import sqlite3
import unittest

from d1_restore import order_export


class RestoreExportTest(unittest.TestCase):
    def test_reorders_schema_before_data_and_delays_triggers(self):
        sql = '''PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
INSERT INTO child VALUES (1, 1);
CREATE TABLE parent(id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO parent VALUES (1, 'uno; dos');
CREATE TABLE audit(message TEXT);
CREATE TRIGGER child_log AFTER INSERT ON child BEGIN INSERT INTO audit VALUES ('created'); END;
'''
        db = sqlite3.connect(':memory:')
        db.executescript('PRAGMA foreign_keys=ON; BEGIN;\n' + order_export(sql) + '\nCOMMIT;')
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(db.execute('SELECT * FROM child').fetchall(), [(1, 1)])
        self.assertEqual(db.execute('SELECT * FROM audit').fetchall(), [])

    def test_unknown_statement_fails_closed(self):
        with self.assertRaises(ValueError):
            order_export('DROP TABLE important;')
        with self.assertRaises(ValueError):
            order_export('CREATE VIRTUAL TABLE documents USING fts5(content);')

    def test_incomplete_statement_rejected(self):
        with self.assertRaises(ValueError):
            order_export("CREATE TABLE a(id INTEGER)")


if __name__ == '__main__':
    unittest.main()
