<?php
/**
 * syBOS Api-CMS Demo
 * 
 * @version 22.04.2008
 * @copyright SOLARYS Informatik GmbH
 */

header("Content-type: text/html; charset=UTF-8");

include("../classes/SyXML.php");
include("../classes/SyList.php");
include("config.php");
include("GeraetView.php");

echo "<h1>Die Geraete aus syBOS</h1>";

$ObjView = new GeraetView($xmlFile,"?page=Geraet");
$ObjView->setBilderLinkTpl('<a class="thickbox" rel="gallery-1" title="" href="{URL_MEDIUM}"><img src="{URL_THUMB}"/></a>');
$ObjView->setPerPage(10);
echo $ObjView->toHtml();