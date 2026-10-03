#!/usr/bin/env python3
r"""
Builds the "Save to Sauced" Apple Shortcut -> public/save-to-sauced.shortcut

    python3 scripts/build-shortcut.py                       # build + sign (needs macOS `shortcuts`)
    python3 scripts/build-shortcut.py --unsigned-out x.plist --no-sign   # just the workflow plist

The HTTP contract lives in lib/share-api.ts (POST /api/share, Bearer key, JSON { url?, text? },
response JSON { ok, message, ... }). The served URL is SHORTCUT_PATH in that file.

How it works
------------
A .shortcut file is a binary plist (the "workflow") that macOS signs into an Apple Encrypted
Archive (AEA) with `shortcuts sign`. The plist format is not documented by Apple; the shapes
below follow the open-source Cherri compiler (github.com/electrikmilk/cherri: shortcut.go,
shortcutgen.go, actions/*.cherri), which emits files that current Shortcuts imports.

Action list (index: action -> what it does)
  0  comment                      note for the cook
  1  gettext       "Sauced Key"   the import question "Paste your Sauced key" fills this in
  2  detect.link                  Get URLs from Shortcut Input (a link, or a Safari page's URL)
  3  text.match    "Web Links"    keep only http(s) links (images can yield file:// URLs)
  4  conditional (If Web Links has any value)
  5    getitemfromlist             first link
  6    setvariable ShareURL
  7    detect.text                 Get Text from Shortcut Input (caption that came with the link)
  8    setvariable ShareText
  9  conditional (Otherwise)
 10    detect.images               Get Images from Shortcut Input (screenshots / photos)
 11    conditional (If Images has any value)
 12      repeat.each Images
 13        extracttextfromimage    on-device OCR of Repeat Item
 14      repeat.each (End)         -> Repeat Results
 15      text.combine              join the OCR text with new lines
 16      setvariable ShareText
 17    conditional (Otherwise)
 18      detect.text               plain shared text
 19      setvariable ShareText
 20    conditional (End If)
 21  conditional (End If)
 22  downloadurl                   POST JSON { url: ShareURL, text: ShareText } with Bearer key
 23  getvalueforkey "message"
 24  conditional (If message has any value)
 25    notification "Sauced" / message
 26  conditional (Otherwise)
 27    notification "Sauced" / "Couldn't reach Sauced. Try again in a moment."
 28  conditional (End If)

Unset variables (ShareURL for screenshots/text) send "" and the server treats them as absent.
Note: Shortcuts has no try/catch. If the phone is offline, "Get Contents of URL" itself fails and
Shortcuts shows its own error; the fallback notification covers every response without a
`message` (server error pages, timeouts that return a body, non-JSON).

Format notes
  - Variables: {"Type": "ActionOutput", "OutputUUID", "OutputName"} for action outputs,
    {"Type": "ExtensionInput"} for the Shortcut Input, {"Type": "Variable", "VariableName"} for
    named variables and "Repeat Item". Wrapped as WFTextTokenAttachment when a parameter is just
    the variable, or inline in a WFTextTokenString ("￼" + attachmentsByRange "{pos, 1}").
  - Control flow: GroupingIdentifier shared by start/middle/end, WFControlFlowMode 0/1/2, the end
    action carries the UUID used for its output. If uses WFInput {"Type": "Variable", "Variable":
    attachment} + WFCondition (100 = has any value).
  - JSON body / headers: WFHTTPBodyType "JSON", WFJSONValues + WFHTTPHeaders as
    WFDictionaryFieldValue with WFDictionaryFieldValueItems (WFItemType 0 = text).
  - Workflow: WFWorkflowTypes ["ActionExtension"] puts it in the share sheet,
    WFWorkflowInputContentItemClasses limits it to links / web pages / text / images,
    WFWorkflowNoInputBehavior GetClipboard makes a plain run use the clipboard.
  - Icon: glyph 59842 (steaming bowl, like the app icon), colour 4251333119 (Shortcuts "dark
    orange" #FD6631, the closest palette colour to the app accent #E0533A).

Rebuild after changing anything here, then commit public/save-to-sauced.shortcut.
Verify a signed file by decoding it (signed with "anyone" = AEA, signed but not encrypted):
  python3 -c "import plistlib,struct,sys;d=open(sys.argv[1],'rb').read();n=struct.unpack('<I',d[8:12])[0];\
open('leaf.der','wb').write(plistlib.loads(d[12:12+n])['SigningCertificateChain'][0])" public/save-to-sauced.shortcut
  openssl x509 -inform der -in leaf.der -pubkey -noout > pub.pem
  aea decrypt -i public/save-to-sauced.shortcut -o out.aar -sign-pub pub.pem && aa extract -i out.aar -d out
  plutil -p out/Shortcut.wflow
"""

import argparse
import os
import plistlib
import subprocess
import sys
import tempfile
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "save-to-sauced.shortcut")

NAME = "Save to Sauced"
ENDPOINT = "https://sauced-sigma.vercel.app/api/share"
KEY_QUESTION = "Paste your Sauced key"
OFFLINE_MESSAGE = "Couldn't reach Sauced. Try again in a moment."

CLIENT_VERSION = "5037.0.17"  # Shortcuts on iOS/macOS 27, per Cherri's version table
GLYPH_STEAMING_BOWL = 59842
COLOR_DARK_ORANGE = 4251333119

OBJ = "￼"  # placeholder character where an inline variable sits

# ---------------------------------------------------------------- value helpers


def new_uuid():
    return str(uuid.uuid4()).upper()


def output(uid, name):
    return {"Type": "ActionOutput", "OutputUUID": uid, "OutputName": name}


SHORTCUT_INPUT = {"Type": "ExtensionInput"}


def named(name):
    return {"Type": "Variable", "VariableName": name}


def attachment(value):
    """A parameter that is exactly one variable."""
    return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}


def text(*parts):
    """A text parameter. Parts are plain strings or variable dicts, joined in order."""
    s = ""
    attachments = {}
    for part in parts:
        if isinstance(part, str):
            s += part
        else:
            pos = len(s.encode("utf-16-le")) // 2  # NSRange counts UTF-16 units
            attachments["{%d, 1}" % pos] = part
            s += OBJ
    value = {"string": s}
    if attachments:
        value["attachmentsByRange"] = attachments
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def dictionary(items):
    """A dictionary parameter (headers, JSON body) with text values."""
    return {
        "Value": {
            "WFDictionaryFieldValueItems": [
                {"WFItemType": 0, "WFKey": text(k), "WFValue": v if isinstance(v, dict) and "WFSerializationType" in v else text(v)}
                for k, v in items
            ]
        },
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def condition_input(value):
    return {"Type": "Variable", "Variable": attachment(value)}


HAS_ANY_VALUE = 100

# ---------------------------------------------------------------- workflow


def build_workflow():
    actions = []

    def act(identifier, params=None):
        actions.append(
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions." + identifier,
                "WFWorkflowActionParameters": params or {},
            }
        )
        return len(actions) - 1

    act(
        "comment",
        {
            "WFCommentActionText": "Save to Sauced: share a recipe link, web page, caption or screenshot "
            "to this shortcut and it lands in your Sauced recipes. Your key is in Sauced > You > "
            "Save from other apps."
        },
    )

    # Sauced key (filled in by the import question)
    key_uuid = new_uuid()
    key_index = act(
        "gettext",
        {"UUID": key_uuid, "CustomOutputName": "Sauced Key", "WFTextActionText": ""},
    )
    key = output(key_uuid, "Sauced Key")

    # Links
    urls_uuid = new_uuid()
    act("detect.link", {"UUID": urls_uuid, "WFInput": attachment(SHORTCUT_INPUT)})
    urls = output(urls_uuid, "URLs")

    links_uuid = new_uuid()
    act(
        "text.match",
        {
            "UUID": links_uuid,
            "CustomOutputName": "Web Links",
            "WFMatchTextPattern": r"https?://\S+",
            "WFMatchTextCaseSensitive": False,
            "text": text(urls),
        },
    )
    links = output(links_uuid, "Web Links")

    if_link = new_uuid()
    act(
        "conditional",
        {
            "GroupingIdentifier": if_link,
            "WFControlFlowMode": 0,
            "WFCondition": HAS_ANY_VALUE,
            "WFInput": condition_input(links),
        },
    )
    first_uuid = new_uuid()
    act(
        "getitemfromlist",
        {"UUID": first_uuid, "WFItemSpecifier": "First Item", "WFInput": attachment(links)},
    )
    act("setvariable", {"WFVariableName": "ShareURL", "WFInput": attachment(output(first_uuid, "Item from List"))})
    link_text_uuid = new_uuid()
    act("detect.text", {"UUID": link_text_uuid, "WFInput": attachment(SHORTCUT_INPUT)})
    act("setvariable", {"WFVariableName": "ShareText", "WFInput": attachment(output(link_text_uuid, "Text"))})

    act("conditional", {"GroupingIdentifier": if_link, "WFControlFlowMode": 1})

    # Screenshots / photos -> on-device OCR
    images_uuid = new_uuid()
    act("detect.images", {"UUID": images_uuid, "WFInput": attachment(SHORTCUT_INPUT)})
    images = output(images_uuid, "Images")

    if_images = new_uuid()
    act(
        "conditional",
        {
            "GroupingIdentifier": if_images,
            "WFControlFlowMode": 0,
            "WFCondition": HAS_ANY_VALUE,
            "WFInput": condition_input(images),
        },
    )
    repeat = new_uuid()
    act("repeat.each", {"GroupingIdentifier": repeat, "WFControlFlowMode": 0, "WFInput": attachment(images)})
    act("extracttextfromimage", {"UUID": new_uuid(), "WFImage": attachment(named("Repeat Item"))})
    repeat_end_uuid = new_uuid()
    act("repeat.each", {"GroupingIdentifier": repeat, "WFControlFlowMode": 2, "UUID": repeat_end_uuid})
    combined_uuid = new_uuid()
    act(
        "text.combine",
        {
            "UUID": combined_uuid,
            "Show-text": True,
            "WFTextSeparator": "New Lines",
            "text": attachment(output(repeat_end_uuid, "Repeat Results")),
        },
    )
    act("setvariable", {"WFVariableName": "ShareText", "WFInput": attachment(output(combined_uuid, "Combined Text"))})

    act("conditional", {"GroupingIdentifier": if_images, "WFControlFlowMode": 1})

    # Plain text
    plain_uuid = new_uuid()
    act("detect.text", {"UUID": plain_uuid, "WFInput": attachment(SHORTCUT_INPUT)})
    act("setvariable", {"WFVariableName": "ShareText", "WFInput": attachment(output(plain_uuid, "Text"))})

    act("conditional", {"GroupingIdentifier": if_images, "WFControlFlowMode": 2, "UUID": new_uuid()})
    act("conditional", {"GroupingIdentifier": if_link, "WFControlFlowMode": 2, "UUID": new_uuid()})

    # Send to Sauced
    response_uuid = new_uuid()
    act(
        "downloadurl",
        {
            "UUID": response_uuid,
            "WFURL": ENDPOINT,
            "WFHTTPMethod": "POST",
            "ShowHeaders": True,
            "WFHTTPHeaders": dictionary(
                [
                    ("Authorization", text("Bearer ", key)),
                    ("Content-Type", "application/json"),
                ]
            ),
            "WFHTTPBodyType": "JSON",
            "WFJSONValues": dictionary(
                [
                    ("url", text(named("ShareURL"))),
                    ("text", text(named("ShareText"))),
                ]
            ),
        },
    )

    message_uuid = new_uuid()
    act(
        "getvalueforkey",
        {
            "UUID": message_uuid,
            "WFGetDictionaryValueType": "Value",
            "WFDictionaryKey": "message",
            "WFInput": attachment(output(response_uuid, "Contents of URL")),
        },
    )
    message = output(message_uuid, "Dictionary Value")

    if_message = new_uuid()
    act(
        "conditional",
        {
            "GroupingIdentifier": if_message,
            "WFControlFlowMode": 0,
            "WFCondition": HAS_ANY_VALUE,
            "WFInput": condition_input(message),
        },
    )
    act(
        "notification",
        {"WFNotificationActionTitle": "Sauced", "WFNotificationActionBody": text(message), "WFNotificationActionSound": True},
    )
    act("conditional", {"GroupingIdentifier": if_message, "WFControlFlowMode": 1})
    act(
        "notification",
        {"WFNotificationActionTitle": "Sauced", "WFNotificationActionBody": OFFLINE_MESSAGE, "WFNotificationActionSound": True},
    )
    act("conditional", {"GroupingIdentifier": if_message, "WFControlFlowMode": 2, "UUID": new_uuid()})

    return {
        "WFWorkflowName": NAME,
        "WFWorkflowClientVersion": CLIENT_VERSION,
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {
            "WFWorkflowIconGlyphNumber": GLYPH_STEAMING_BOWL,
            "WFWorkflowIconStartColor": COLOR_DARK_ORANGE,
        },
        "WFWorkflowTypes": ["ActionExtension"],
        "WFQuickActionSurfaces": [],
        "WFWorkflowInputContentItemClasses": [
            "WFImageContentItem",
            "WFRichTextContentItem",
            "WFSafariWebPageContentItem",
            "WFStringContentItem",
            "WFURLContentItem",
        ],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowNoInputBehavior": {"Name": "WFWorkflowNoInputBehaviorGetClipboard", "Parameters": {}},
        "WFWorkflowImportQuestions": [
            {
                "ActionIndex": key_index,
                "Category": "Parameter",
                "ParameterKey": "WFTextActionText",
                "Text": KEY_QUESTION,
                "DefaultValue": "",
            }
        ],
        "WFWorkflowActions": actions,
    }


# ---------------------------------------------------------------- main


def main():
    parser = argparse.ArgumentParser(description="Build and sign the Save to Sauced shortcut.")
    parser.add_argument("--unsigned-out", help="where to write the unsigned plist (default: a temp dir)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="signed .shortcut path")
    parser.add_argument("--no-sign", action="store_true", help="only write the unsigned plist")
    args = parser.parse_args()

    workflow = build_workflow()
    unsigned = args.unsigned_out or os.path.join(tempfile.mkdtemp(prefix="sauced-shortcut-"), "unsigned.shortcut")
    with open(unsigned, "wb") as f:
        plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
    print(f"Unsigned workflow ({len(workflow['WFWorkflowActions'])} actions): {unsigned}")
    if args.no_sign:
        return

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    cmd = ["shortcuts", "sign", "--mode", "anyone", "--input", unsigned, "--output", args.output]
    print("$ " + " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    if result.returncode != 0 or not os.path.getsize(args.output):
        sys.exit(f"shortcuts sign failed (exit {result.returncode})")
    os.chmod(args.output, 0o644)
    print(f"Signed: {args.output} ({os.path.getsize(args.output)} bytes)")

    # Shortcuts names an imported file after its file name (the signed plist carries no name),
    # so keep a copy called "Save to Sauced.shortcut" for importing on this Mac. When serving
    # the public file, send Content-Disposition: attachment; filename="Save to Sauced.shortcut".
    named_copy = os.path.join(os.path.dirname(unsigned), NAME + ".shortcut")
    with open(args.output, "rb") as src, open(named_copy, "wb") as dst:
        dst.write(src.read())
    print(f"Import copy: {named_copy}")
    print(
        f"""
Test on this Mac:
  1. open "{named_copy}"   -> Add Shortcut, paste a Sauced key (Sauced > You > Save from other apps)
  2. Link:       printf 'https://www.bbcgoodfood.com/recipes/classic-lasagne' > /tmp/link.txt
                 shortcuts run "{NAME}" -i /tmp/link.txt
  3. Text:       printf 'Pancakes\\n2 eggs\\n300 ml milk\\n120 g flour\\nWhisk and fry.' > /tmp/caption.txt
                 shortcuts run "{NAME}" -i /tmp/caption.txt
  4. Screenshot: shortcuts run "{NAME}" -i ~/Desktop/<recipe screenshot>.png
  Each run shows a "Sauced" notification with the server's message."""
    )


if __name__ == "__main__":
    main()
