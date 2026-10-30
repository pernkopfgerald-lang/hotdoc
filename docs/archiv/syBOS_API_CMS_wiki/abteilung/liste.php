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
include("AbteilungView.php");

echo "<h1>Die Abteilungen aus syBOS</h1>";

$ObjView = new AbteilungView($xmlFile,"?page=Abteilungen");
$ObjView->setFilterLkz("DE");
echo $ObjView->toHtml();