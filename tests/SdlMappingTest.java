import com.gamepadmapper.app.SdlMapping;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

/**
 * Pruebas de SdlMapping (mandos de la comunidad en modo root): CRC y GUID como SDL, lectura y
 * validacion de lineas, mando_info y la tabla mando.map. Con un argumento escribe ahi la tabla del
 * mando de ejemplo para que tests/run.sh la pase por gpmapper.
 */
public class SdlMappingTest {
    private static int fails = 0;

    private static void check(boolean ok, String what) {
        if (!ok) {
            System.err.println("FALLO: " + what);
            fails++;
        }
    }

    private static void eq(Object a, Object b, String what) {
        check(a == null ? b == null : a.equals(b), what + ": esperaba «" + b + "», salio «" + a + "»");
    }

    // Lineas reales de SDL GameControllerDB (zlib).
    static final String SHANWAN = "03000000632500002305000010010000,ShanWan Gamepad,a:b2,b:b1,back:b8,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,leftshoulder:b4,leftstick:b10,lefttrigger:b6,leftx:a0,lefty:a1,rightshoulder:b5,rightstick:b11,righttrigger:b7,rightx:a2,righty:a3,start:b9,x:b3,y:b0,platform:Linux,";
    static final String PDP = "030000006f0e0000b20200000f010000,PDP Xbox One Controller,a:b0,b:b1,y:b3,x:b2,start:b7,back:b6,leftstick:b9,rightstick:b10,leftshoulder:b4,rightshoulder:b5,dpup:b12,dpleft:b14,dpdown:b13,dpright:b15,leftx:a0,lefty:a1,rightx:a3,righty:a4,lefttrigger:a2,righttrigger:a5,platform:Linux,";

    /** Mando HID generico como lo describe gpmapper (12 botones BTN_TRIGGER.., 4 ejes y cruceta en hat). */
    static final String SHANWAN_INFO = "bus=0003\nvendor=2563\nproduct=0523\nversion=0110\nname=ShanWan Gamepad\n"
            + "keys=120,121,122,123,124,125,126,127,128,129,12a,12b\nabs=0,1,2,5,10,11\n";

    public static void main(String[] args) throws Exception {
        // CRC-16/ARC y GUID (mismos casos que desktop/app/nucleo/src/mapeo/sdl.rs)
        eq(SdlMapping.crc16("123456789".getBytes(StandardCharsets.US_ASCII)), 0xBB3D, "crc16");
        eq(SdlMapping.crc16(new byte[0]), 0, "crc16 vacio");
        eq(SdlMapping.guid(0x03, 0x045e, 0x028e, 0x0114, ""), "030000005e0400008e02000014010000", "guid Xbox 360");
        eq(SdlMapping.guid(0x05, 0x054c, 0x05c4, 0x8100, ""), "050000004c050000c405000000810000", "guid DS4 Bluetooth");
        String named = SdlMapping.guid(0x03, 0x045e, 0x028e, 0x0114, "Microsoft X-Box 360 pad");
        int crc = SdlMapping.crc16("Microsoft X-Box 360 pad".getBytes(StandardCharsets.UTF_8));
        eq(named.substring(4, 8), String.format("%02x%02x", crc & 0xff, crc >> 8), "guid con CRC del nombre");
        eq(named.substring(8), "5e0400008e02000014010000", "guid con nombre: resto igual");
        String virt = SdlMapping.guid(0x06, 0, 0, 0, "Pad");
        check(virt.startsWith("0600") && virt.substring(8, 14).equals("506164"), "guid sin ids lleva el nombre");
        List<String> v = SdlMapping.variants("030012345e0400008e02000014010000");
        eq(v.get(1), "030000005e0400008e02000014010000", "variante sin CRC");
        eq(v.get(2), "030000005e0400008e02000000000000", "variante sin version");

        // mando_info
        SdlMapping.Info info = SdlMapping.Info.parse(SHANWAN_INFO);
        check(info != null, "mando_info valido");
        eq(info.guid(), "0300" + String.format("%02x%02x", SdlMapping.crc16("ShanWan Gamepad".getBytes(StandardCharsets.UTF_8)) & 0xff,
                SdlMapping.crc16("ShanWan Gamepad".getBytes(StandardCharsets.UTF_8)) >> 8) + "632500002305000010010000", "guid del mando");
        check(SdlMapping.variants(info.guid()).contains("03000000632500002305000010010000"), "se encuentra sin CRC");
        check(info.nonStandard(), "HID generico: hay que traducir");
        SdlMapping.Info xbox = SdlMapping.Info.parse("bus=3\nvendor=45e\nproduct=28e\nversion=114\nname=X\nkeys=130,131,133,134,136,137,13a,13b,13c,13d,13e\nabs=0,1,2,3,4,5,10,11\n");
        check(xbox != null && !xbox.nonStandard(), "mando con driver propio: no se traduce");
        check(SdlMapping.Info.parse("bus=3\nvendor=zz\nkeys=130\n") == null, "mando_info con hex no valido");
        check(SdlMapping.Info.parse("bus=3\nvendor=1\nkeys=130,999\n") == null, "mando_info con codigo fuera de rango");
        check(SdlMapping.Info.parse("bus=3\nname=X\n") == null, "mando_info sin ids ni botones");

        // Lineas SDL
        SdlMapping.Line l = SdlMapping.Line.parse(SHANWAN);
        check(l != null && "Linux".equals(l.platform) && "b2".equals(l.pairs.get("a")), "linea real");
        check(SdlMapping.Line.parse("zz,Pad,a:b0,platform:Linux,") == null, "GUID no valido");
        check(SdlMapping.Line.parse("03000000632500002305000010010000,<script>,a:b0,platform:Linux,") == null, "nombre con <");
        check(SdlMapping.Line.parse("03000000632500002305000010010000,Pad\u0007,a:b0,platform:Linux,") == null, "caracter de control");
        check(SdlMapping.Line.parse("03000000632500002305000010010000,Pad,a:x9,platform:Linux,") == null, "valor no valido");
        check(SdlMapping.Line.parse("03000000632500002305000010010000,Pad,a:b0,a:b1,platform:Linux,") == null, "control repetido");
        check(SdlMapping.Line.parse("# comentario") == null, "comentario");
        StringBuilder huge = new StringBuilder("03000000632500002305000010010000,Pad,");
        while (huge.length() < 1100) huge.append("a:b0,");
        check(SdlMapping.Line.parse(huge.toString()) == null, "linea demasiado larga");
        check(SdlMapping.Line.parse("03000000632500002305000010010000,Pad,a:b0,crc:1234,hint:!X:=1,platform:Linux,") != null,
                "extras desconocidos (crc, hint) se ignoran");

        // Tabla para gpmapper
        String map = SdlMapping.buildMap(info, l, "SDL GameControllerDB");
        check(map != null, "tabla del ShanWan");
        if (map != null) {
            for (String rule : new String[]{"mando 3 2563 0523 0110", "nombre ShanWan Gamepad", "ABS_10 = ABS_HAT0X",
                    "ABS_11 = ABS_HAT0Y", "BTN_122 = A", "BTN_121 = B", "BTN_123 = X", "BTN_120 = Y", "BTN_128 = SELECT",
                    "BTN_129 = START", "BTN_124 = L1", "BTN_125 = R1", "BTN_126 = L2", "BTN_127 = R2", "BTN_12A = L3",
                    "BTN_12B = R3", "ABS_0 = ABS_X", "ABS_1 = ABS_Y", "ABS_2 = ABS_RX", "ABS_5 = ABS_RY"}) {
                check(map.contains("\n" + rule + "\n"), "la tabla tiene «" + rule + "»");
            }
            check(!map.contains("DPAD_"), "cruceta estandar en hat: sin reglas de medio eje");
        }
        // La linea de otro modelo (botones que este mando no tiene): no se usa.
        check(SdlMapping.buildMap(info, SdlMapping.Line.parse(PDP), "x") == null, "linea que no encaja con el mando");
        // Cruceta como botones y gatillos como ejes (PDP con 16 botones).
        SdlMapping.Info pdp = SdlMapping.Info.parse("bus=3\nvendor=e6f\nproduct=2b2\nversion=10f\nname=PDP\n"
                + "keys=120,121,122,123,124,125,126,127,128,129,12a,12b,12c,12d,12e,12f\nabs=0,1,2,3,4,5\n");
        String pm = SdlMapping.buildMap(pdp, SdlMapping.Line.parse(PDP), "x");
        check(pm != null && pm.contains("\nBTN_12C = DPAD_UP\n") && pm.contains("\nABS_2 = ABS_Z\n")
                && pm.contains("\nABS_5 = ABS_RZ\n") && pm.contains("\nABS_3 = ABS_RX\n"), "cruceta en botones y gatillos analogicos");
        // Cruceta en medios ejes e invertidos.
        SdlMapping.Line half = SdlMapping.Line.parse("0300000000000000000000000000000f,Prueba,a:b0,b:b1,x:b2,y:b3,"
                + "dpleft:-a2,dpright:+a2,dpup:h0.4,dpdown:h0.1,lefty:a1~,leftx:a0,platform:Linux,");
        SdlMapping.Info hi = SdlMapping.Info.parse("bus=3\nvendor=1\nproduct=2\nversion=0\nname=P\nkeys=120,121,122,123\nabs=0,1,6,10,11\n");
        String hm = SdlMapping.buildMap(hi, half, "x");
        check(hm != null && hm.contains("\nABS_6- = DPAD_LEFT\n") && hm.contains("\nABS_6+ = DPAD_RIGHT\n")
                && hm.contains("\nABS_11+ = DPAD_UP\n") && hm.contains("\nABS_11- = DPAD_DOWN\n")
                && hm.contains("\nABS_1 = ABS_Y~\n"), "medios ejes, hat no estandar e inversion");

        if (args.length > 0 && map != null) Files.write(Paths.get(args[0]), map.getBytes(StandardCharsets.UTF_8));
        if (fails > 0) {
            System.err.println(fails + " fallo(s)");
            System.exit(1);
        }
        System.out.println("SdlMapping: todo correcto");
    }
}
