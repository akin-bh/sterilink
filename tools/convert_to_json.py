#!/usr/bin/env python3
"""
Simple converter: reads a tab-delimited .txt file and writes JSON.
Usage:
  python3 convert_to_json.py data/pesticides.txt data/pesticides.json
"""
import sys, json

def tsv_to_json(infile, outfile):
    with open(infile, 'r', encoding='utf-8') as f:
        lines = [l.rstrip('\n') for l in f if l.strip()]
    if not lines:
        print('Empty file')
        return
    headers = lines[0].split('\t')
    rows = []
    for line in lines[1:]:
        cols = line.split('\t')
        obj = {headers[i]: (cols[i] if i < len(cols) else '') for i in range(len(headers))}
        rows.append(obj)
    with open(outfile, 'w', encoding='utf-8') as fo:
        json.dump(rows, fo, indent=2)
    print(f'Wrote {len(rows)} records to {outfile}')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: convert_to_json.py input.txt output.json')
        sys.exit(1)
    tsv_to_json(sys.argv[1], sys.argv[2])
