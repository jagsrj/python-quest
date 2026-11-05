import sys, io, math, random, traceback, types, json

class _NeedInput(Exception):
    pass

_T = {}

def _reset_turtle():
    _T.clear()
    _T.update({'ops': [], 'used': False, 'turtles': [], 'default': None, 'bg': None, 'mode': 255})

_reset_turtle()

def _color(c):
    if len(c) == 1:
        c = c[0]
        if isinstance(c, str):
            return c
        c = tuple(c)
    if len(c) == 3:
        vals = [float(v) for v in c]
        if all(v <= 1 for v in vals) and _T['mode'] == 1.0:
            vals = [v * 255 for v in vals]
        elif all(v <= 1 for v in vals) and any(isinstance(v, float) for v in c):
            vals = [v * 255 for v in vals]
        r, g, b = [max(0, min(255, int(round(v)))) for v in vals]
        return 'rgb(%d,%d,%d)' % (r, g, b)
    raise ValueError('a colour looks like "red" or (255, 0, 0)')


class Turtle:
    def __init__(self, *args, **kwargs):
        self.x = 0.0; self.y = 0.0; self.h = 0.0
        self.down = True; self.pc = 'black'; self.fc = 'black'; self.w = 2.0
        self.filling = None; self.fill_at = 0; self.visible = True
        _T['used'] = True
        _T['turtles'].append(self)

    def _move(self, nx, ny):
        if self.down:
            _T['ops'].append(['line', self.x, self.y, nx, ny, self.pc, self.w])
        if self.filling is not None:
            self.filling.append([nx, ny])
        self.x, self.y = nx, ny

    def forward(self, distance):
        d = float(distance); r = math.radians(self.h)
        self._move(self.x + d * math.cos(r), self.y + d * math.sin(r))
    fd = forward
    def backward(self, distance): self.forward(-float(distance))
    bk = back = backward
    def left(self, angle): self.h = (self.h + float(angle)) % 360
    lt = left
    def right(self, angle): self.left(-float(angle))
    rt = right
    def penup(self): self.down = False
    pu = up = penup
    def pendown(self): self.down = True
    pd = down = pendown
    def isdown(self): return self.down
    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._move(float(x), float(y))
    setpos = setposition = goto
    def setx(self, x): self._move(float(x), self.y)
    def sety(self, y): self._move(self.x, float(y))
    def home(self):
        self.goto(0, 0); self.h = 0.0
    def setheading(self, angle): self.h = float(angle) % 360
    seth = setheading
    def heading(self): return self.h
    def position(self): return (round(self.x, 2), round(self.y, 2))
    pos = position
    def xcor(self): return round(self.x, 2)
    def ycor(self): return round(self.y, 2)
    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(self.x - float(x), self.y - float(y))
    def pencolor(self, *c):
        if not c: return self.pc
        self.pc = _color(c)
    def fillcolor(self, *c):
        if not c: return self.fc
        self.fc = _color(c)
    def color(self, *c):
        if not c: return (self.pc, self.fc)
        if len(c) == 2:
            self.pc = _color((c[0],)); self.fc = _color((c[1],))
        else:
            self.pc = self.fc = _color(c)
    def pensize(self, width=None):
        if width is None: return self.w
        self.w = float(width)
    width = pensize
    def begin_fill(self):
        self.filling = [[self.x, self.y]]
        self.fill_at = len(_T['ops'])
    def end_fill(self):
        if self.filling and len(self.filling) > 2:
            _T['ops'].insert(self.fill_at, ['fill', self.filling, self.fc])
        self.filling = None
    def circle(self, radius, extent=None, steps=None):
        radius = float(radius)
        extent = 360.0 if extent is None else float(extent)
        if steps is None:
            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * abs(extent) / 360.0)
        w = extent / steps
        w2 = 0.5 * w
        l = 2.0 * radius * math.sin(math.radians(w2))
        if radius < 0:
            l, w, w2 = -l, -w, -w2
        self.left(w2)
        for _ in range(steps):
            self.forward(l)
            self.left(w)
        self.left(-w2)
    def dot(self, size=None, *c):
        col = _color(c) if c else self.pc
        _T['ops'].append(['dot', self.x, self.y, float(size) if size else max(self.w + 4, 2 * self.w), col])
    def write(self, arg, move=False, align='left', font=None):
        size = 12
        if font and len(font) > 1:
            try: size = int(font[1])
            except Exception: pass
        _T['ops'].append(['text', self.x, self.y, str(arg), self.pc, align, size])
    def stamp(self): self.dot(8)
    def speed(self, *a, **k): pass
    def shape(self, *a, **k): pass
    def shapesize(self, *a, **k): pass
    turtlesize = shapesize
    def hideturtle(self): self.visible = False
    ht = hideturtle
    def showturtle(self): self.visible = True
    st = showturtle
    def isvisible(self): return self.visible
    def clear(self): pass
    def reset(self): pass


Pen = RawTurtle = Turtle


class _Screen:
    def bgcolor(self, *c):
        if c: _T['bg'] = _color(c)
        _T['used'] = True
    def colormode(self, mode=None):
        if mode is None: return _T['mode']
        _T['mode'] = mode
    def setup(self, *a, **k): pass
    def title(self, *a, **k): pass
    def tracer(self, *a, **k): pass
    def update(self): pass
    def exitonclick(self): pass
    def mainloop(self): pass
    done = mainloop
    def bye(self): pass
    def listen(self): pass
    def onkey(self, *a, **k): pass

_screen = _Screen()
def Screen(): return _screen

def _default():
    if _T['default'] is None:
        _T['default'] = Turtle()
    return _T['default']

_tmod = types.ModuleType('turtle')
_names = ['forward','fd','backward','bk','back','left','lt','right','rt','penup','pu','up','pendown','pd','down',
          'isdown','goto','setpos','setposition','setx','sety','home','setheading','seth','heading','position','pos',
          'xcor','ycor','distance','pencolor','fillcolor','color','pensize','width','begin_fill','end_fill','circle',
          'dot','write','stamp','speed','shape','shapesize','turtlesize','hideturtle','ht','showturtle','st','isvisible',
          'clear','reset']

def _make(name):
    def f(*a, **k):
        return getattr(_default(), name)(*a, **k)
    f.__name__ = name
    return f

for _n in _names:
    setattr(_tmod, _n, _make(_n))
for _n in ['bgcolor','colormode','setup','title','tracer','update','exitonclick','mainloop','done','bye','listen','onkey']:
    setattr(_tmod, _n, getattr(_screen, _n))
_tmod.Turtle = Turtle; _tmod.Pen = Pen; _tmod.RawTurtle = Turtle; _tmod.Screen = Screen
_tmod.__all__ = _names + ['bgcolor','colormode','setup','title','tracer','update','exitonclick','mainloop','done',
                          'bye','listen','onkey','Turtle','Pen','RawTurtle','Screen']
sys.modules['turtle'] = _tmod


def _describe(e):
    line = None; text = None
    if isinstance(e, SyntaxError):
        line = e.lineno; msg = e.msg or ''
        text = (e.text or '').rstrip('\n')
    else:
        msg = str(e)
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == 'main.py':
                line = fr.lineno
    return {'type': type(e).__name__, 'msg': msg, 'line': line, 'text': text}


def pq_run(code, inputs, seed):
    _reset_turtle()
    random.seed(seed)
    out = io.StringIO()
    feed = list(inputs)

    def _input(prompt=''):
        p = str(prompt)
        out.write(p)
        if not feed:
            raise _NeedInput(p)
        v = str(feed.pop(0))
        out.write(v + '\n')
        return v

    import builtins
    g = {'__name__': '__main__', '__builtins__': builtins, 'input': _input}
    so, se = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    err = None; need = None
    try:
        exec(compile(code, 'main.py', 'exec'), g)
    except _NeedInput as e:
        need = e.args[0] if e.args else ''
    except SystemExit:
        pass
    except BaseException as e:
        err = _describe(e)
    finally:
        sys.stdout, sys.stderr = so, se
    text = out.getvalue()
    if len(text) > 20000:
        text = text[:20000] + '\n... (output cut off: too much printing)'
    turtles = [{'x': t.x, 'y': t.y, 'h': t.h, 'visible': t.visible} for t in _T['turtles']]
    return json.dumps({'out': text, 'err': err, 'need': need,
                       'turtle': {'used': _T['used'], 'ops': _T['ops'], 'bg': _T['bg'], 'turtles': turtles}})
