import docx
import sys
import os

def iter_block_items(parent):
    from docx.document import Document
    from docx.oxml.text.paragraph import CT_P
    from docx.oxml.table import CT_Tbl
    from docx.table import Table, _Cell
    from docx.text.paragraph import Paragraph

    if isinstance(parent, Document):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        raise ValueError("unsupported parent")

    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)

def dump(path, out):
    d = docx.Document(path)
    for block in iter_block_items(d):
        if hasattr(block, 'text'):
            # Paragraph
            style = block.style.name if block.style else ''
            text = block.text
            if text.strip():
                prefix = ''
                if style and 'Heading' in style:
                    prefix = f"[{style}] "
                out.write(prefix + text + "\n")
        else:
            # Table
            out.write("\n[TABLE]\n")
            for row in block.rows:
                cells = [c.text.strip().replace('\n', ' | ') for c in row.cells]
                out.write(" || ".join(cells) + "\n")
            out.write("[/TABLE]\n\n")

if __name__ == '__main__':
    src = sys.argv[1]
    dst = sys.argv[2]
    with open(dst, 'w', encoding='utf-8') as out:
        dump(src, out)
    print("done", dst)
